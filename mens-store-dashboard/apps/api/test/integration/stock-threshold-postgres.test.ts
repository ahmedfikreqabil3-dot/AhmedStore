import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createStockThresholdService } from '../../src/modules/inventory/threshold.js';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient();const service=createStockThresholdService(prisma);let organizations:string[]=[];let organizationId:string;let otherId:string;let actorId:string;let warehouseId:string;let productId:string;
beforeAll(async()=>{for(const name of ['Threshold tests','Other threshold tests'])organizations.push((await prisma.organization.create({data:{name:`${name} ${randomUUID()}`}})).id);[organizationId,otherId]=organizations;});
beforeEach(async()=>{actorId=(await prisma.user.create({data:{organizationId,name:'Inventory manager',email:`${randomUUID()}@example.test`,passwordHash:'unused',role:'MANAGER'}})).id;warehouseId=(await prisma.warehouse.create({data:{organizationId,name:'Threshold warehouse'}})).id;productId=(await prisma.product.create({data:{organizationId,name:'Threshold shirt',sku:randomUUID(),salePrice:'20',costPrice:'10'}})).id;});
afterEach(async()=>{const where={organizationId:{in:organizations}};await prisma.auditEvent.deleteMany({where});await prisma.stockThreshold.deleteMany({where});await prisma.inventoryTransaction.deleteMany({where});await prisma.product.deleteMany({where});await prisma.warehouse.deleteMany({where});await prisma.user.deleteMany({where});});
afterAll(async()=>{await prisma.organization.deleteMany({where:{id:{in:organizations}}});await prisma.$disconnect();});
const input=(minimum='1.1250',version=0)=>({warehouseId,productId,minimum,version});
const query={mode:'low' as const,limit:25,offset:0};
async function stock(quantity:string,day='01'){await prisma.inventoryTransaction.create({data:{organizationId,warehouseId,productId,type:'ADJUSTMENT',quantity,referenceType:'Fixture',referenceId:randomUUID(),occurredAt:new Date(`2026-10-${day}T12:00:00.000Z`)}});}

it('includes a movement at the exact UTC as-of boundary and excludes a later millisecond',async()=>{
  await service.set(organizationId,actorId,input('5'));
  const asOf=new Date('2026-10-10T12:00:00Z');
  await stock('2.1234','10');
  await prisma.inventoryTransaction.create({data:{organizationId,warehouseId,productId,type:'ADJUSTMENT',quantity:'100',referenceType:'Fixture',referenceId:randomUUID(),occurredAt:new Date(asOf.getTime()+1)}});
  expect((await service.list(organizationId,{...query,mode:'all',asOf})).thresholds[0]!.quantity).toBe('2.1234');
});

it('creates/updates exact versioned thresholds with an atomic audit and reads actual stock',async()=>{
  expect(await service.set(organizationId,actorId,input())).toMatchObject({ok:true,threshold:{minimum:'1.1250',version:1}});await stock('1.1250');
  const page=await service.list(organizationId,query);expect(page.total).toBe(1);expect(page.thresholds[0]).toMatchObject({productName:'Threshold shirt',minimum:'1.1250',quantity:'1.1250',version:1});
  expect(await service.set(organizationId,actorId,input('0',1))).toMatchObject({ok:true,threshold:{minimum:'0.0000',version:2}});expect((await service.list(organizationId,query)).total).toBe(0);expect((await service.list(organizationId,{...query,mode:'all'})).thresholds).toHaveLength(1);
  const audit=await prisma.auditEvent.findMany({where:{organizationId},orderBy:{createdAt:'asc'}});expect(audit.map(row=>row.action)).toEqual(['STOCK_THRESHOLD_CREATED','STOCK_THRESHOLD_UPDATED']);expect(audit[1]!.details).toMatchObject({previousMinimum:'1.1250',minimum:'0.0000',version:2});
});

it('applies historical time, warehouse, tenant, page and active-resource filters',async()=>{
  await service.set(organizationId,actorId,input());await stock('4','20');const asOf=new Date('2026-10-10T12:00:00Z');expect((await service.list(organizationId,{...query,warehouseId,asOf})).thresholds[0]!.quantity).toBe('0.0000');
  expect((await service.list(organizationId,{...query,mode:'all',offset:25})).thresholds).toEqual([]);expect((await service.list(otherId,{...query,mode:'all'})).total).toBe(0);expect((await service.list(organizationId,{...query,warehouseId:randomUUID(),mode:'all'})).total).toBe(0);
  await prisma.product.update({where:{id:productId},data:{active:false}});expect((await service.list(organizationId,{...query,mode:'all'})).total).toBe(0);await prisma.product.update({where:{id:productId},data:{active:true}});await prisma.warehouse.update({where:{id:warehouseId},data:{active:false}});expect((await service.list(organizationId,{...query,mode:'all'})).total).toBe(0);
});

it('rejects stale/new-record versions and prevents simultaneous settings from overwriting one another',async()=>{
  expect(await service.set(organizationId,actorId,input('1',1))).toEqual({ok:false,reason:'VERSION_CONFLICT'});
  const created=await Promise.all([service.set(organizationId,actorId,input('1')),service.set(organizationId,actorId,input('2'))]);expect(created.filter(row=>row.ok)).toHaveLength(1);expect(created.filter(row=>!row.ok)).toEqual([{ok:false,reason:'VERSION_CONFLICT'}]);
  const edited=await Promise.all([service.set(organizationId,actorId,input('3',1)),service.set(organizationId,actorId,input('4',1))]);expect(edited.filter(row=>row.ok)).toHaveLength(1);expect(edited.filter(row=>!row.ok)).toEqual([{ok:false,reason:'VERSION_CONFLICT'}]);expect((await prisma.stockThreshold.findFirstOrThrow({where:{organizationId}})).version).toBe(2);
});

it('rejects foreign resources and unauthorized actors before writing',async()=>{
  expect(await service.set(organizationId,actorId,{...input(),productId:randomUUID()})).toEqual({ok:false,reason:'PRODUCT_UNAVAILABLE'});expect(await service.set(organizationId,actorId,{...input(),warehouseId:randomUUID()})).toEqual({ok:false,reason:'WAREHOUSE_UNAVAILABLE'});expect(await service.set(organizationId,randomUUID(),input())).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});
  await prisma.user.update({where:{id:actorId},data:{role:'FINANCE'}});expect(await service.set(organizationId,actorId,input())).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});expect(await prisma.stockThreshold.count({where:{organizationId}})).toBe(0);
});

it('rolls settings back when the audit write fails',async()=>{
  const broken=new Proxy(prisma,{get(target,property){if(property==='$transaction')return (work:(tx:unknown)=>unknown,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(transaction,key){if(key==='auditEvent')return {create:async()=>{throw Error('Threshold audit unavailable');}};return Reflect.get(transaction,key);}})) as Promise<never>,options as never);return Reflect.get(target,property);}});
  await expect(createStockThresholdService(broken).set(organizationId,actorId,input())).rejects.toThrow('Threshold audit unavailable');expect(await prisma.stockThreshold.count({where:{organizationId}})).toBe(0);
});

it('enforces tenant/quantity/version constraints independently of request validation',async()=>{
  const data={organizationId,warehouseId,productId,minimum:'0'};await expect(prisma.stockThreshold.create({data:{...data,minimum:'-1'}})).rejects.toThrow();await expect(prisma.stockThreshold.create({data:{...data,version:0}})).rejects.toThrow();
  const otherProduct=await prisma.product.create({data:{organizationId:otherId,name:'Foreign',sku:randomUUID(),salePrice:'1',costPrice:'1'}});await expect(prisma.stockThreshold.create({data:{...data,productId:otherProduct.id}})).rejects.toMatchObject({code:'P2003'});
});
