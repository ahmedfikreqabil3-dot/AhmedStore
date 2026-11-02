import {randomUUID} from 'node:crypto';
import {PrismaClient,type Prisma} from '@prisma/client';
import {beforeAll,afterAll,expect,it} from 'vitest';
import {createSaleDraftService} from '../../src/modules/sales/drafts.js';
import {createApplicationServices} from '../../src/services.js';
if(new URL(process.env.DATABASE_URL!).pathname!=='/ahmed_store_api_tests')throw Error('Isolated test database required');
const db=new PrismaClient(),service=createSaleDraftService(db),s=createApplicationServices(db);
let org:string,other:string,actor:string,cashier:string,customer:string,warehouse:string,product:string;
const input=()=>({kind:'QUOTATION' as const,customerId:customer,warehouseId:warehouse,lines:[{productId:product,quantity:'1',unitPrice:'19.95',discount:'0'}]});
const create=()=>service.create(org,actor,randomUUID(),input());
async function financialState(){
  const where={organizationId:org},ordered={where,orderBy:{id:'asc' as const}};
  return JSON.stringify(await Promise.all([
    db.inventoryTransaction.findMany(ordered),db.treasuryTransaction.findMany(ordered),db.treasuryAccount.findMany(ordered),
    db.customerLedgerEntry.findMany(ordered),db.supplierLedgerEntry.findMany(ordered),db.sale.findMany(ordered),
    db.saleLine.findMany({where:{sale:where},orderBy:{id:'asc'}}),db.salePayment.findMany({where:{sale:where},orderBy:{id:'asc'}})
  ]));
}
beforeAll(async()=>{
  org=(await db.organization.create({data:{name:'Drafts '+randomUUID()}})).id;other=(await db.organization.create({data:{name:'Other draft org'}})).id;
  actor=(await db.user.create({data:{organizationId:org,name:'Draft admin',email:'admin@example.test',passwordHash:'unused',role:'ADMIN'}})).id;
  cashier=(await db.user.create({data:{organizationId:org,name:'Draft cashier',email:'cashier@example.test',passwordHash:'unused',role:'CASHIER'}})).id;
  customer=(await db.customer.create({data:{organizationId:org,name:'Draft customer'}})).id;warehouse=(await db.warehouse.create({data:{organizationId:org,name:'Draft branch'}})).id;
  product=(await db.product.create({data:{organizationId:org,name:'Original draft product',sku:'DRAFT-PRODUCT',salePrice:'19.95',costPrice:'10'}})).id;
  await db.inventoryTransaction.create({data:{organizationId:org,warehouseId:warehouse,productId:product,type:'OPENING_BALANCE',quantity:'100',referenceType:'QA',referenceId:randomUUID(),occurredAt:new Date('2026-01-01')}});
  await s.treasuryService.createAccount(org,actor,randomUUID(),{name:'Draft cash',paymentMethod:'CASH',openingBalance:'0',reason:'Draft test account'});
});
afterAll(async()=>{
  const where={organizationId:{in:[org,other]}};await db.saleDraft.deleteMany({where});await db.customerLedgerEntry.deleteMany({where});await db.treasuryTransaction.deleteMany({where});await db.inventoryTransaction.deleteMany({where});await db.auditEvent.deleteMany({where});await db.salePayment.deleteMany({where:{sale:where}});await db.saleLine.deleteMany({where:{sale:where}});await db.sale.deleteMany({where});await db.treasuryAccount.deleteMany({where});await db.product.deleteMany({where});await db.customer.deleteMany({where});await db.warehouse.deleteMany({where});await db.user.deleteMany({where});await db.organization.deleteMany({where:{id:{in:[org,other]}}});await db.$disconnect();
});
it('saves snapshots without posting, replays exact creation and bounds scoped lists',async()=>{
  const key=randomUUID(),before=await db.inventoryTransaction.count({where:{organizationId:org}});
  const draft=await service.create(org,actor,key,input());expect(draft.total).toBe('19.9500');expect(draft).not.toHaveProperty('conversionKey');expect(draft).not.toHaveProperty('requestHash');
  expect((await service.create(org,actor,key,input())).id).toBe(draft.id);await expect(service.create(org,cashier,key,input())).rejects.toThrow('IDEMPOTENCY_KEY_CONFLICT');await expect(service.create(org,actor,key,{...input(),kind:'HELD'})).rejects.toThrow('IDEMPOTENCY_KEY_CONFLICT');
  expect(await db.inventoryTransaction.count({where:{organizationId:org}})).toBe(before);expect(await db.sale.count({where:{organizationId:org}})).toBe(0);
  await db.product.update({where:{id:product},data:{name:'Renamed product',salePrice:'200'}});expect((await service.read(org,draft.id)).lines[0]!.productName).toBe('Original draft product');
  expect((await service.list(org,{kind:'QUOTATION',status:'OPEN',limit:1,offset:0})).items).toHaveLength(1);expect((await service.list(org,{limit:1,offset:100},cashier)).items).toHaveLength(0);
  await expect(service.read(other,draft.id)).rejects.toThrow('DRAFT_NOT_FOUND');await expect(service.read(org,draft.id,cashier)).rejects.toThrow('DRAFT_NOT_FOUND');await expect(service.cancel(org,cashier,draft.id,1,cashier)).rejects.toThrow('DRAFT_NOT_FOUND');
});
it('rejects unavailable masters, invalid discounts and zero totals',async()=>{
  await expect(service.create(org,actor,randomUUID(),{...input(),customerId:randomUUID()})).rejects.toThrow('PARTY_UNAVAILABLE');await expect(service.create(org,actor,randomUUID(),{...input(),warehouseId:randomUUID()})).rejects.toThrow('PARTY_UNAVAILABLE');
  await expect(service.create(org,actor,randomUUID(),{...input(),lines:[{...input().lines[0]!,productId:randomUUID()}]})).rejects.toThrow('PRODUCT_UNAVAILABLE');
  await expect(service.create(org,actor,randomUUID(),{...input(),lines:[{...input().lines[0]!,discount:'20'}]})).rejects.toThrow('LINE_DISCOUNT_EXCEEDS_SUBTOTAL');
  await expect(service.create(org,actor,randomUUID(),{...input(),lines:[{...input().lines[0]!,discount:'19.95'}]})).rejects.toThrow('INVALID_TOTAL');
});
it('leaves every stock and financial record unchanged throughout both unconfirmed draft journeys',async()=>{
  const before=await financialState();
  for(const kind of ['QUOTATION','HELD'] as const){
    const proposal={...input(),kind,lines:[{...input().lines[0]!,quantity:'1000'}]};
    const draft=await service.create(org,actor,randomUUID(),proposal);expect(await financialState()).toBe(before);
    await service.read(org,draft.id);await service.list(org,{kind,status:'OPEN',limit:25,offset:0});expect(await financialState()).toBe(before);
    const edited=await service.update(org,actor,draft.id,{customerId:customer,warehouseId:warehouse,lines:[{...proposal.lines[0]!,quantity:'999'}],version:1});expect(await financialState()).toBe(before);
    await service.cancel(org,actor,draft.id,edited.version);expect(await financialState()).toBe(before);
  }
});
it('uses optimistic versions for edits, preserves kind and cancels without financial effects',async()=>{
  const draft=await create(),body={customerId:customer,warehouseId:warehouse,lines:[{...input().lines[0]!,quantity:'2'}],version:1};
  const updated=await service.update(org,actor,draft.id,body,actor);expect(updated).toMatchObject({version:2,total:'39.9000',kind:'QUOTATION'});
  await expect(service.update(org,actor,draft.id,body)).rejects.toThrow('DRAFT_CHANGED');const cancelled=await service.cancel(org,actor,draft.id,2);expect(cancelled.status).toBe('CANCELLED');expect((await service.cancel(org,actor,draft.id,2)).id).toBe(draft.id);
  await expect(service.update(org,actor,draft.id,{...body,version:3})).rejects.toThrow('DRAFT_CLOSED');await expect(service.convert(org,actor,draft.id,{version:3,payments:[{method:'CASH',amount:'39.9'}]})).rejects.toThrow('DRAFT_CLOSED');
  expect(await db.sale.count({where:{organizationId:org}})).toBe(0);
});
it('serializes concurrent conversion, posts original prices once and protects owner scope',async()=>{
  const draft=await service.create(org,cashier,randomUUID(),{...input(),kind:'HELD'}),body={version:1,payments:[{method:'CASH' as const,amount:'19.95'}]};
  const [a,b]=await Promise.all([service.convert(org,cashier,draft.id,body,cashier),service.convert(org,cashier,draft.id,body,cashier)]);expect(a.saleId).toBe(b.saleId);expect(a.status).toBe('CONVERTED');
  const sale=await db.sale.findUniqueOrThrow({where:{id:a.saleId!},include:{lines:true,payments:true}});expect(sale.total.toFixed(4)).toBe('19.9500');expect(sale.lines[0]!.unitPrice.toFixed(4)).toBe('19.9500');expect(await db.inventoryTransaction.count({where:{organizationId:org,referenceId:sale.id}})).toBe(1);expect(await db.treasuryTransaction.count({where:{organizationId:org,sourceId:sale.id}})).toBe(1);
  expect((await service.convert(org,cashier,draft.id,body,cashier)).saleId).toBe(sale.id);await expect(service.cancel(org,actor,draft.id,2)).rejects.toThrow('DRAFT_CLOSED');
});
it('rolls back failed sale checks and draft audits, and safely races cancel with conversion',async()=>{
  const draft=await create();await expect(service.convert(org,actor,draft.id,{version:1,payments:[{method:'CASH',amount:'1'}]})).rejects.toThrow('PAYMENT_TOTAL_MISMATCH');expect((await service.read(org,draft.id)).status).toBe('OPEN');
  const proxy=new Proxy(db,{get(target,key){if(key==='$transaction')return (work:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:unknown)=>db.$transaction(tx=>work(new Proxy(tx,{get(t,k){if(k==='auditEvent')return {...t.auditEvent,create:(args:Parameters<typeof t.auditEvent.create>[0])=>{if(args!.data.action==='DRAFT_CONVERTED')throw Error('AUDIT_FAILURE');return t.auditEvent.create(args!);}};return Reflect.get(t,k);}})),options as never);return Reflect.get(target,key);}});
  const before=await db.sale.count({where:{organizationId:org}});await expect(createSaleDraftService(proxy).convert(org,actor,draft.id,{version:1,payments:[{method:'CREDIT',amount:'19.95'}]})).rejects.toThrow('AUDIT_FAILURE');expect(await db.sale.count({where:{organizationId:org}})).toBe(before);expect((await service.read(org,draft.id)).status).toBe('OPEN');
  const race=await create();await Promise.allSettled([service.cancel(org,actor,race.id,1),service.convert(org,actor,race.id,{version:1,payments:[{method:'CREDIT',amount:'19.95'}]})]);const final=await service.read(org,race.id);expect(['CONVERTED','CANCELLED']).toContain(final.status);expect(await db.sale.count({where:{organizationId:org}})).toBe(before+(final.status==='CONVERTED'?1:0));
});
