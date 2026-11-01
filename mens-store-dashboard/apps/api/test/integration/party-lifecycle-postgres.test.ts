import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from 'vitest';
import {createPartyLifecycleService} from '../../src/modules/parties/lifecycle.js';
import {createApplicationServices} from '../../src/services.js';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient(),service=createPartyLifecycleService(prisma);let organizations:string[]=[];
let organizationId:string,otherId:string,actorId:string,customerId:string,supplierId:string,warehouseId:string;
const change={active:false,version:1,reason:'توقف التعامل مؤقتًا'};
beforeAll(async()=>{for(const name of ['Lifecycle','Foreign lifecycle'])organizations.push((await prisma.organization.create({data:{name:name+randomUUID()}})).id);[organizationId,otherId]=organizations;});
beforeEach(async()=>{actorId=(await prisma.user.create({data:{organizationId,name:'Admin',email:randomUUID()+'@example.test',role:'ADMIN',passwordHash:'unused'}})).id;customerId=(await prisma.customer.create({data:{organizationId,name:'Lifecycle customer'}})).id;supplierId=(await prisma.supplier.create({data:{organizationId,name:'Lifecycle supplier'}})).id;warehouseId=(await prisma.warehouse.create({data:{organizationId,name:'Lifecycle branch'}})).id;});
afterEach(async()=>{const where={organizationId:{in:organizations}};await prisma.auditEvent.deleteMany({where});await prisma.customerLedgerEntry.deleteMany({where});await prisma.supplierLedgerEntry.deleteMany({where});await prisma.salesReturn.deleteMany({where});await prisma.treasuryTransaction.deleteMany({where});await prisma.inventoryTransaction.deleteMany({where});await prisma.salePayment.deleteMany({where:{sale:where}});await prisma.saleLine.deleteMany({where:{sale:where}});await prisma.sale.deleteMany({where});await prisma.product.deleteMany({where});await prisma.customer.deleteMany({where});await prisma.supplier.deleteMany({where});await prisma.warehouse.deleteMany({where});await prisma.user.deleteMany({where});});
afterAll(async()=>{await prisma.organization.deleteMany({where:{id:{in:organizations}}});await prisma.$disconnect();});
const customerCredit=(amount:string,type='SALE_CREDIT')=>prisma.customerLedgerEntry.create({data:{organizationId,customerId,actorUserId:actorId,type,sourceType:type==='SALE_CREDIT'?'Sale':'SalesReturn',sourceId:randomUUID(),amount,occurredAt:new Date()}});

it('archives and restores parties with reasoned immutable audits and versioned transitions',async()=>{
  const composed=createApplicationServices(prisma);
  expect(await composed.customerService.lifecycle(organizationId,actorId,customerId,change)).toMatchObject({ok:true,party:{active:false,version:2}});
  expect(await composed.supplierService.lifecycle(organizationId,actorId,supplierId,change)).toMatchObject({ok:true,party:{active:false,version:2}});
  expect(await service.change(organizationId,actorId,'customers',customerId,{...change,version:2})).toMatchObject({ok:true,party:{version:2}});
  expect(await service.change(organizationId,actorId,'customers',customerId,{...change,version:2,active:true})).toMatchObject({ok:true,party:{active:true,version:3}});
  expect(await service.change(organizationId,actorId,'suppliers',supplierId,{...change,version:2,active:true})).toMatchObject({ok:true,party:{active:true,version:3}});
  const events=await prisma.auditEvent.findMany({where:{organizationId}});expect(events).toHaveLength(4);expect(events.map(row=>row.action).sort()).toEqual(['CUSTOMER_ARCHIVED','CUSTOMER_REACTIVATED','SUPPLIER_ARCHIVED','SUPPLIER_REACTIVATED']);expect(events.every(row=>(row.details as {reason:string}).reason===change.reason)).toBe(true);
});

it('blocks both customer debt and credit balances and a pending return without hiding account history',async()=>{
  await customerCredit('20');expect(await service.change(organizationId,actorId,'customers',customerId,change)).toEqual({ok:false,reason:'OPEN_BALANCE'});
  await customerCredit('-25','RETURN_CREDIT');expect(await service.change(organizationId,actorId,'customers',customerId,change)).toEqual({ok:false,reason:'OPEN_BALANCE'});
  await customerCredit('5');
  await prisma.salesReturn.create({data:{organizationId,customerId,warehouseId,actorUserId:actorId,reason:'Pending fixture',status:'PENDING_APPROVAL',total:'1',occurredAt:new Date()}});
  expect(await service.change(organizationId,actorId,'customers',customerId,change)).toEqual({ok:false,reason:'PENDING_DOCUMENT'});expect((await prisma.customer.findUniqueOrThrow({where:{id:customerId}})).active).toBe(true);expect(await prisma.customerLedgerEntry.count({where:{organizationId}})).toBe(3);
});

it('uses signed supplier obligations and archives only a settled supplier account',async()=>{
  const add=(type:'PURCHASE_CREDIT'|'SUPPLIER_PAYMENT',amount:string)=>prisma.supplierLedgerEntry.create({data:{organizationId,supplierId,actorUserId:actorId,type,amount,sourceType:'Fixture',sourceId:randomUUID(),occurredAt:new Date()}});
  await add('PURCHASE_CREDIT','20.1234');expect(await service.change(organizationId,actorId,'suppliers',supplierId,change)).toEqual({ok:false,reason:'OPEN_BALANCE'});
  await add('SUPPLIER_PAYMENT','20.1234');expect(await service.change(organizationId,actorId,'suppliers',supplierId,change)).toMatchObject({ok:true,party:{active:false}});
  expect(await prisma.supplierLedgerEntry.count({where:{organizationId}})).toBe(2);
});

it('paginates active, archived and all directories without leaking a foreign organization',async()=>{
  await prisma.customer.create({data:{organizationId,name:'Archived account',active:false,creditLimit:'12.1234'}});await prisma.supplier.create({data:{organizationId,name:'Archived supplier',active:false}});
  const composed=createApplicationServices(prisma),query={status:'all' as const,limit:1,offset:0};
  expect(await composed.customerService.directory(organizationId,query)).toMatchObject({kind:'customers',total:2,parties:[{creditLimit:'12.1234'}]});
  expect(await composed.supplierService.directory(organizationId,query)).toMatchObject({kind:'suppliers',total:2,parties:[{active:false}]});
  for(const kind of ['customers','suppliers'] as const){
    expect(await service.directory(organizationId,kind,{...query,status:'active'})).toMatchObject({total:1,parties:[{active:true}]});
    expect(await service.directory(organizationId,kind,{...query,status:'archived'})).toMatchObject({total:1,parties:[{active:false}]});
    expect(await service.directory(organizationId,kind,{...query,offset:2})).toMatchObject({total:2,parties:[]});expect(await service.directory(otherId,kind,query)).toMatchObject({total:0,parties:[]});
  }
});

it('rejects missing, inactive, wrong-role and foreign actors and foreign party IDs',async()=>{
  expect(await service.change(organizationId,randomUUID(),'customers',customerId,change)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});
  const foreign=(await prisma.user.create({data:{organizationId:otherId,name:'Foreign admin',email:'foreign@example.test',role:'ADMIN',passwordHash:'unused'}})).id;
  expect(await service.change(organizationId,foreign,'suppliers',supplierId,change)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});
  for(const role of ['CASHIER','WAREHOUSE','FINANCE'] as const){await prisma.user.update({where:{id:actorId},data:{role}});expect(await service.change(organizationId,actorId,'customers',customerId,change)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});}
  await prisma.user.update({where:{id:actorId},data:{role:'ADMIN',active:false}});expect(await service.change(organizationId,actorId,'customers',customerId,change)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});await prisma.user.update({where:{id:actorId},data:{active:true}});
  expect(await service.change(organizationId,actorId,'customers',randomUUID(),change)).toEqual({ok:false,reason:'PARTY_NOT_FOUND'});expect(await service.change(organizationId,actorId,'suppliers',randomUUID(),change)).toEqual({ok:false,reason:'PARTY_NOT_FOUND'});
});

it('serializes racing lifecycle updates and refuses stale versions without extra audits',async()=>{
  const results=await Promise.all([service.change(organizationId,actorId,'customers',customerId,change),service.change(organizationId,actorId,'customers',customerId,change)]);
  expect(results.filter(result=>result.ok)).toHaveLength(1);expect(results.filter(result=>!result.ok)).toEqual([{ok:false,reason:'VERSION_CONFLICT'}]);expect(await prisma.auditEvent.count({where:{organizationId}})).toBe(1);
});

it('does not archive a customer concurrently with an outstanding new credit sale',async()=>{
  const product=await prisma.product.create({data:{organizationId,name:'Race shirt',sku:randomUUID(),salePrice:'10',costPrice:'5'}});
  const at=new Date('2026-10-30T12:00:00Z');await prisma.inventoryTransaction.create({data:{organizationId,warehouseId,productId:product.id,type:'OPENING_BALANCE',quantity:'1',referenceType:'Fixture',referenceId:randomUUID(),occurredAt:at}});
  let arrived=0;let release!:()=>void;const gate=new Promise<void>(done=>{release=done;});
  const overlapped=new Proxy(prisma,{get(target,key){if(key==='$transaction')return (work:(tx:unknown)=>unknown,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(transaction,property){if(property==='customer')return new Proxy(transaction.customer,{get(model,field){if(field==='findFirst')return async(...args:unknown[])=>{const row=await (model.findFirst as (...args:unknown[])=>Promise<unknown>)(...args);if(arrived<2){if(++arrived===2)release();await gate;}return row;};return Reflect.get(model,field);}});return Reflect.get(transaction,property);}})) as Promise<never>,options as never);return Reflect.get(target,key);}});
  const composed=createApplicationServices(overlapped);
  const results=await Promise.all([composed.customerService.lifecycle(organizationId,actorId,customerId,change),composed.salesService.post(organizationId,actorId,randomUUID(),{customerId,warehouseId,occurredAt:at,lines:[{productId:product.id,quantity:'1',unitPrice:'10',discount:'0'}],payments:[{method:'CREDIT',amount:'10'}]})]);
  expect(results.filter(result=>result.ok)).toHaveLength(1);
  const customer=await prisma.customer.findUniqueOrThrow({where:{id:customerId}}),debt=await prisma.customerLedgerEntry.aggregate({where:{organizationId,customerId},_sum:{amount:true}});
  expect(customer.active||!debt._sum.amount||debt._sum.amount.isZero()).toBe(true);
});

it('rolls archive and version changes back when audit fails and detects a lost conditional update',async()=>{
  const altered=(mode:'audit'|'update')=>new Proxy(prisma,{get(target,key){if(key==='$transaction')return (work:(tx:unknown)=>unknown,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(transaction,property){if(mode==='audit'&&property==='auditEvent')return {create:async()=>{throw Error('Lifecycle audit unavailable');}};if(mode==='update'&&(property==='customer'||property==='supplier'))return new Proxy(Reflect.get(transaction,property),{get(model,field){if(field==='updateMany')return async()=>({count:0});return Reflect.get(model,field);}});return Reflect.get(transaction,property);}})) as Promise<never>,options as never);return Reflect.get(target,key);}});
  for(const [kind,id] of [['customers',customerId],['suppliers',supplierId]] as const){await expect(createPartyLifecycleService(altered('audit')).change(organizationId,actorId,kind,id,change)).rejects.toThrow('Lifecycle audit unavailable');expect(await createPartyLifecycleService(altered('update')).change(organizationId,actorId,kind,id,change)).toEqual({ok:false,reason:'VERSION_CONFLICT'});}
  expect((await prisma.customer.findUniqueOrThrow({where:{id:customerId}})).version).toBe(1);expect((await prisma.supplier.findUniqueOrThrow({where:{id:supplierId}})).active).toBe(true);expect(await prisma.auditEvent.count({where:{organizationId}})).toBe(0);
});
