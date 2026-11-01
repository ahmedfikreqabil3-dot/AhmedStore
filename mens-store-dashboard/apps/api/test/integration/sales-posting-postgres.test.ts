import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { CreateSaleInput } from '@ahmed-store/contracts';
import { createSalesService } from '../../src/modules/sales/service.js';
import { createPrismaSalesRepository } from '../../src/modules/sales/prisma-repository.js';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient();const repository=createPrismaSalesRepository(prisma);const service=createSalesService(repository);
let organizations:string[]=[];let organizationId:string;let otherId:string;let actorId:string;let customerId:string;let warehouseId:string;let productId:string;
const day=(date:string)=>new Date(`2026-10-${date}T12:00:00.000Z`);
beforeAll(async()=>{for(const name of ['Sale posting tests','Other sale posting tests'])organizations.push((await prisma.organization.create({data:{name:`${name} ${randomUUID()}`}})).id);[organizationId,otherId]=organizations;});
beforeEach(async()=>{
  actorId=(await prisma.user.create({data:{organizationId,name:'Seller',email:`${randomUUID()}@example.test`,passwordHash:'unused-test-hash',role:'ADMIN'}})).id;
  customerId=(await prisma.customer.create({data:{organizationId,name:'Test customer'}})).id;
  warehouseId=(await prisma.warehouse.create({data:{organizationId,name:'Test warehouse'}})).id;
  productId=(await prisma.product.create({data:{organizationId,name:'Original shirt',sku:randomUUID(),salePrice:'19.9500',costPrice:'5.1234'}})).id;
});
afterEach(async()=>{
  const where={organizationId:{in:organizations}};
  await prisma.customerLedgerEntry.deleteMany({where});
  await prisma.auditEvent.deleteMany({where});await prisma.treasuryTransaction.deleteMany({where});await prisma.inventoryTransaction.deleteMany({where});
  await prisma.salePayment.deleteMany({where:{sale:where}});await prisma.saleLine.deleteMany({where:{sale:where}});await prisma.sale.deleteMany({where});
  await prisma.product.deleteMany({where});await prisma.customer.deleteMany({where});await prisma.warehouse.deleteMany({where});await prisma.user.deleteMany({where});
});
afterAll(async()=>{await prisma.organization.deleteMany({where:{id:{in:organizations}}});await prisma.$disconnect();});
function input():CreateSaleInput{return {customerId,warehouseId,occurredAt:day('20'),lines:[{productId,quantity:'1',unitPrice:'19.9500',discount:'0'}],payments:[{method:'CASH',amount:'19.9500'}]};}
async function stock(quantity:string,occurredAt=day('01')){await prisma.inventoryTransaction.create({data:{organizationId,warehouseId,productId,type:'OPENING_BALANCE',quantity,referenceType:'TestFixture',referenceId:randomUUID(),occurredAt}});}

it('treats zero credit limit as unlimited and writes one exact customer debt movement per sale',async()=>{
  await stock('5');
  const command={...input(),payments:[{method:'CREDIT' as const,amount:'19.95'}]};
  const key=randomUUID();expect(await service.post(organizationId,actorId,key,command)).toMatchObject({ok:true});
  expect(await service.post(organizationId,actorId,key,command)).toMatchObject({ok:true,replayed:true});
  expect(await service.post(organizationId,actorId,randomUUID(),command)).toMatchObject({ok:true});
  const entries=await prisma.customerLedgerEntry.findMany({where:{organizationId,customerId}});
  expect(entries).toHaveLength(2);expect(entries.every(row=>row.type==='SALE_CREDIT'&&row.amount.toFixed(4)==='19.9500')).toBe(true);
  expect(await prisma.treasuryTransaction.count({where:{organizationId}})).toBe(0);
});

it('enforces a positive limit on accumulated debt but allows a fully paid sale above that limit',async()=>{
  await stock('5');await prisma.customer.update({where:{id:customerId},data:{creditLimit:'19.95'}});
  const command={...input(),payments:[{method:'CREDIT' as const,amount:'19.95'}]};
  const key=randomUUID();expect(await service.post(organizationId,actorId,key,command)).toMatchObject({ok:true});
  expect(await service.post(organizationId,actorId,randomUUID(),command)).toEqual({ok:false,reason:'CREDIT_LIMIT_EXCEEDED'});
  await prisma.customer.update({where:{id:customerId},data:{creditLimit:'1'}});
  expect(await service.post(organizationId,actorId,key,command)).toMatchObject({ok:true,replayed:true});
  expect(await service.post(organizationId,actorId,randomUUID(),input())).toMatchObject({ok:true});
  expect(await prisma.customerLedgerEntry.count({where:{organizationId}})).toBe(1);
  expect(await prisma.sale.count({where:{organizationId}})).toBe(2);
});

it('serializes concurrent credit sales against the same remaining allowance',async()=>{
  await stock('5');await prisma.customer.update({where:{id:customerId},data:{creditLimit:'30'}});
  const command={...input(),payments:[{method:'CREDIT' as const,amount:'19.95'}]};
  const results=await Promise.all([service.post(organizationId,actorId,randomUUID(),command),service.post(organizationId,actorId,randomUUID(),command)]);
  expect(results.filter(row=>row.ok)).toHaveLength(1);expect(results.filter(row=>!row.ok)).toEqual([{ok:false,reason:'CREDIT_LIMIT_EXCEEDED'}]);
  expect(await prisma.customerLedgerEntry.count({where:{organizationId}})).toBe(1);
  expect(await prisma.inventoryTransaction.count({where:{organizationId,type:'SALE_ISSUE'}})).toBe(1);
});

it('rechecks a lowered credit limit at commit and rolls back customer debt if audit fails',async()=>{
  await stock('5');
  const command={...input(),payments:[{method:'CREDIT' as const,amount:'19.95'}]};
  const lowered=createSalesService({...repository,async post(value){await prisma.customer.update({where:{id:customerId},data:{creditLimit:'10'}});return repository.post(value);}});
  expect(await lowered.post(organizationId,actorId,randomUUID(),command)).toEqual({ok:false,reason:'CREDIT_LIMIT_EXCEEDED'});
  await prisma.customer.update({where:{id:customerId},data:{creditLimit:'0'}});
  await expect(service.post(organizationId,randomUUID(),randomUUID(),command)).rejects.toMatchObject({code:'P2003'});
  expect(await prisma.customerLedgerEntry.count({where:{organizationId}})).toBe(0);expect(await prisma.sale.count({where:{organizationId}})).toBe(0);
});

it('posts exact split payments, stock issues, immutable product snapshots and audit atomically and replays once',async()=>{
  await stock('1');const key=randomUUID();const command={...input(),lines:[{productId,quantity:'0.25',unitPrice:'19.9500',discount:'0'},{productId,quantity:'0.75',unitPrice:'19.9500',discount:'0'}],payments:[{method:'CASH' as const,amount:'10'},{method:'CREDIT' as const,amount:'9.9500'}]};
  const result=await service.post(organizationId,actorId,key,command);expect(result).toMatchObject({ok:true,replayed:false,sale:{total:'19.9500'}});
  expect(await service.post(organizationId,actorId,key,command)).toMatchObject({ok:true,replayed:true});
  expect(await prisma.sale.count({where:{organizationId}})).toBe(1);expect(await prisma.inventoryTransaction.count({where:{organizationId,type:'SALE_ISSUE'}})).toBe(2);
  const treasury=await prisma.treasuryTransaction.findMany({where:{organizationId}});expect(treasury).toHaveLength(1);expect(treasury[0]!.amount.toFixed(4)).toBe('10.0000');
  await prisma.product.update({where:{id:productId},data:{name:'Changed product name'}});expect((await prisma.saleLine.findMany({where:{productId}})).map(line=>line.productName)).toEqual(['Original shirt','Original shirt']);
  expect(await prisma.auditEvent.count({where:{organizationId,action:'SALE_POSTED'}})).toBe(1);
});

it('keeps missing stock and foreign tenant records unavailable',async()=>{
  expect(await service.post(organizationId,actorId,randomUUID(),input())).toEqual({ok:false,reason:'INSUFFICIENT_STOCK'});
  const foreignCustomer=await prisma.customer.create({data:{organizationId:otherId,name:'Other customer'}});const foreignWarehouse=await prisma.warehouse.create({data:{organizationId:otherId,name:'Other warehouse'}});
  expect(await repository.findCustomer(foreignCustomer.id,organizationId)).toBeNull();expect(await repository.findWarehouse(foreignWarehouse.id,organizationId)).toBeNull();expect(await repository.findProducts([productId],otherId)).toEqual([]);
  await stock('0.5000');expect(await service.post(organizationId,actorId,randomUUID(),input())).toEqual({ok:false,reason:'INSUFFICIENT_STOCK'});
  expect(await prisma.sale.count({where:{organizationId}})).toBe(0);
});

it('rolls all postings back if the audit actor is invalid',async()=>{
  await stock('1');await expect(service.post(organizationId,randomUUID(),randomUUID(),input())).rejects.toMatchObject({code:'P2003'});
  expect(await prisma.sale.count({where:{organizationId}})).toBe(0);expect(await prisma.treasuryTransaction.count({where:{organizationId}})).toBe(0);expect(await prisma.inventoryTransaction.count({where:{organizationId,type:'SALE_ISSUE'}})).toBe(0);
});

it('does not oversell when two independent commands compete for the last unit',async()=>{
  await stock('1');const results=await Promise.allSettled([service.post(organizationId,actorId,randomUUID(),input()),service.post(organizationId,actorId,randomUUID(),input())]);
  expect(results.filter(result=>result.status==='fulfilled'&&result.value.ok)).toHaveLength(1);
  expect(await prisma.sale.count({where:{organizationId}})).toBe(1);expect((await prisma.inventoryTransaction.aggregate({where:{organizationId,productId},_sum:{quantity:true}}))._sum.quantity!.toFixed(4)).toBe('0.0000');
});

it('rejects a backdated sale that would make a later historical balance negative',async()=>{
  await stock('1',day('01'));await stock('-1',day('10'));await stock('1',day('15'));
  const result=await service.post(organizationId,actorId,randomUUID(),{...input(),occurredAt:day('05')});
  expect(result).toEqual({ok:false,reason:'INSUFFICIENT_STOCK'});expect(await prisma.sale.count({where:{organizationId}})).toBe(0);
});

it('replays a competing command inside the transaction without duplicate stock or money movements',async()=>{
  await stock('2');const key=randomUUID();
  // Both services pass their outside lookup before either transaction posts.
  let arrived=0;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const concurrent=createSalesService({...repository,async findByIdempotencyKey(){if(++arrived===2)release();await gate;return null;}});
  const results=await Promise.all([concurrent.post(organizationId,actorId,key,input()),concurrent.post(organizationId,actorId,key,input())]);
  expect(results.every(result=>result.ok)).toBe(true);expect(results.filter(result=>result.ok&&result.replayed)).toHaveLength(1);
  expect(await prisma.sale.count({where:{organizationId}})).toBe(1);expect(await prisma.treasuryTransaction.count({where:{organizationId}})).toBe(1);
  expect(await prisma.inventoryTransaction.count({where:{organizationId,type:'SALE_ISSUE'}})).toBe(1);
});

it('rechecks active master data in the posting transaction after earlier validation',async()=>{
  await stock('1');
  for(const [entity,reason] of [['customer','CUSTOMER_UNAVAILABLE'],['warehouse','WAREHOUSE_UNAVAILABLE'],['product','PRODUCT_UNAVAILABLE']] as const){
    const update=async(active:boolean)=>{if(entity==='customer')await prisma.customer.update({where:{id:customerId},data:{active}});else if(entity==='warehouse')await prisma.warehouse.update({where:{id:warehouseId},data:{active}});else await prisma.product.update({where:{id:productId},data:{active}});};
    const paused=createSalesService({...repository,async post(command){await update(false);return repository.post(command);}});
    expect(await paused.post(organizationId,actorId,randomUUID(),input())).toEqual({ok:false,reason});await update(true);
  }
  expect(await prisma.sale.count({where:{organizationId}})).toBe(0);
});
