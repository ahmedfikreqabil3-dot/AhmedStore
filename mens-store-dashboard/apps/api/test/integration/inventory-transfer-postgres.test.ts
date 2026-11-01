import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createInventoryTransferService } from '../../src/modules/inventory/transfer.js';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient();const service=createInventoryTransferService(prisma);
let organizations:string[]=[];let organizationId:string,otherId:string,actorId:string,productId:string,sourceWarehouseId:string,destinationWarehouseId:string;
const occurredAt=new Date('2026-10-30T10:00:00.000Z');
beforeAll(async()=>{for(const name of ['Transfer tests','Other transfer tests'])organizations.push((await prisma.organization.create({data:{name:`${name} ${randomUUID()}`}})).id);[organizationId,otherId]=organizations;});
beforeEach(async()=>{
  actorId=(await prisma.user.create({data:{organizationId,name:'Warehouse manager',email:`${randomUUID()}@example.test`,passwordHash:'unused-test-hash',role:'WAREHOUSE'}})).id;
  productId=(await prisma.product.create({data:{organizationId,name:'Transfer shirt',sku:randomUUID(),salePrice:'20',costPrice:'10'}})).id;
  sourceWarehouseId=(await prisma.warehouse.create({data:{organizationId,name:'Source'}})).id;destinationWarehouseId=(await prisma.warehouse.create({data:{organizationId,name:'Destination'}})).id;
});
afterEach(async()=>{const where={organizationId:{in:organizations}};await prisma.auditEvent.deleteMany({where});await prisma.inventoryTransaction.deleteMany({where});await prisma.inventoryTransfer.deleteMany({where});await prisma.product.deleteMany({where});await prisma.warehouse.deleteMany({where});await prisma.user.deleteMany({where});});
afterAll(async()=>{await prisma.organization.deleteMany({where:{id:{in:organizations}}});await prisma.$disconnect();});
const input=()=>({productId,sourceWarehouseId,destinationWarehouseId,quantity:'1.1250',reason:'تغذية الفرع',occurredAt});
async function opening(quantity='10'){await prisma.inventoryTransaction.create({data:{organizationId,productId,warehouseId:sourceWarehouseId,type:'OPENING_BALANCE',quantity,referenceType:'TestFixture',referenceId:randomUUID(),occurredAt:new Date('2026-10-01T00:00:00.000Z')}});}

it('records exact paired movements, immutable snapshots, audit details and a tenant-scoped paginated history',async()=>{
  await opening();const key=randomUUID();const result=await service.post(organizationId,actorId,key,input(),'request-1');expect(result).toMatchObject({ok:true,replayed:false,transfer:{quantity:'1.1250'}});
  if(!result.ok)throw Error('Expected transfer');
  const entries=await prisma.inventoryTransaction.findMany({where:{organizationId,referenceId:result.transfer.id},orderBy:{quantity:'asc'}});expect(entries.map(row=>[row.type,row.quantity.toFixed(4)])).toEqual([['TRANSFER_OUT','-1.1250'],['TRANSFER_IN','1.1250']]);
  const audit=await prisma.auditEvent.findFirstOrThrow({where:{organizationId,entityId:result.transfer.id}});expect(audit.requestId).toBe('request-1');expect(audit.details).toMatchObject({reason:input().reason,quantity:'1.1250'});
  await prisma.product.update({where:{id:productId},data:{name:'Renamed product'}});expect(await service.post(organizationId,actorId,key,input())).toMatchObject({ok:true,replayed:true,transfer:{productName:'Transfer shirt'}});
  await service.post(organizationId,actorId,randomUUID(),input());const page=await service.list(organizationId,{limit:1,offset:1});expect(page.total).toBe(2);expect(page.transfers).toHaveLength(1);expect(page.transfers[0]).not.toHaveProperty('idempotencyKey');expect((await service.list(otherId,{limit:50,offset:0})).transfers).toEqual([]);
});

it('rejects foreign/inactive products, unavailable warehouses, foreign actors and insufficient stock',async()=>{
  expect(await service.post(organizationId,actorId,randomUUID(),input())).toEqual({ok:false,reason:'INSUFFICIENT_STOCK'});
  expect(await service.post(otherId,actorId,randomUUID(),input())).toEqual({ok:false,reason:'PRODUCT_UNAVAILABLE'});
  await prisma.product.update({where:{id:productId},data:{active:false}});expect(await service.post(organizationId,actorId,randomUUID(),input())).toEqual({ok:false,reason:'PRODUCT_UNAVAILABLE'});await prisma.product.update({where:{id:productId},data:{active:true}});
  const foreign=await prisma.warehouse.create({data:{organizationId:otherId,name:'Foreign'}});expect(await service.post(organizationId,actorId,randomUUID(),{...input(),destinationWarehouseId:foreign.id})).toEqual({ok:false,reason:'WAREHOUSE_UNAVAILABLE'});
  await prisma.warehouse.update({where:{id:destinationWarehouseId},data:{active:false}});expect(await service.post(organizationId,actorId,randomUUID(),input())).toEqual({ok:false,reason:'WAREHOUSE_UNAVAILABLE'});await prisma.warehouse.update({where:{id:destinationWarehouseId},data:{active:true}});
  expect(await service.post(organizationId,randomUUID(),randomUUID(),input())).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});await prisma.user.update({where:{id:actorId},data:{role:'CASHIER'}});expect(await service.post(organizationId,actorId,randomUUID(),input())).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});expect(await prisma.inventoryTransfer.count({where:{organizationId}})).toBe(0);
});

it('makes duplicate concurrent requests one transfer and prevents two commands taking the last unit',async()=>{
  await opening('2');const key=randomUUID();const duplicate=await Promise.all([service.post(organizationId,actorId,key,{...input(),quantity:'1'}),service.post(organizationId,actorId,key,{...input(),quantity:'1'})]);expect(duplicate.every(result=>result.ok)).toBe(true);expect(duplicate.filter(result=>result.ok&&result.replayed)).toHaveLength(1);
  const competing=await Promise.all([service.post(organizationId,actorId,randomUUID(),{...input(),quantity:'1'}),service.post(organizationId,actorId,randomUUID(),{...input(),quantity:'1'})]);expect(competing.filter(result=>result.ok)).toHaveLength(1);expect(competing.filter(result=>!result.ok)).toEqual([{ok:false,reason:'INSUFFICIENT_STOCK'}]);expect(await prisma.inventoryTransfer.count({where:{organizationId}})).toBe(2);
});

it('rolls back transfer, both ledger entries and audit if the audit write fails',async()=>{
  await opening();const broken={$transaction:(work:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:{isolationLevel:Prisma.TransactionIsolationLevel})=>prisma.$transaction(tx=>work(new Proxy(tx,{get(target,key){if(key==='auditEvent')return {create:async()=>{throw Error('audit unavailable');}};return Reflect.get(target,key);}})),options)} as unknown as PrismaClient;
  await expect(createInventoryTransferService(broken).post(organizationId,actorId,randomUUID(),input())).rejects.toThrow('audit unavailable');expect(await prisma.inventoryTransfer.count({where:{organizationId}})).toBe(0);expect(await prisma.inventoryTransaction.count({where:{organizationId,referenceType:'InventoryTransfer'}})).toBe(0);
});

it('enforces positive amounts, distinct warehouses and tenant references at database level',async()=>{
  const data={...input(),id:randomUUID(),organizationId,actorUserId:actorId,idempotencyKey:randomUUID(),productName:'Shirt',sku:'SH-1'};
  await expect(prisma.inventoryTransfer.create({data:{...data,quantity:'-1'}})).rejects.toThrow();await expect(prisma.inventoryTransfer.create({data:{...data,destinationWarehouseId:sourceWarehouseId}})).rejects.toThrow();
  const foreign=await prisma.warehouse.create({data:{organizationId:otherId,name:'Foreign'}});await expect(prisma.inventoryTransfer.create({data:{...data,destinationWarehouseId:foreign.id}})).rejects.toMatchObject({code:'P2003'});
});
