import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createStockCountService } from '../../src/modules/inventory/count.js';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient();const service=createStockCountService(prisma);let organizations:string[]=[];let organizationId:string;let otherId:string;let actorId:string;let warehouseId:string;let productId:string;
const day=(date:string)=>new Date(`2026-10-${date}T12:00:00.000Z`);
beforeAll(async()=>{for(const name of ['Count tests','Other count tests'])organizations.push((await prisma.organization.create({data:{name:`${name} ${randomUUID()}`}})).id);[organizationId,otherId]=organizations;});
beforeEach(async()=>{actorId=(await prisma.user.create({data:{organizationId,name:'Counter',email:`${randomUUID()}@example.test`,passwordHash:'unused',role:'WAREHOUSE'}})).id;warehouseId=(await prisma.warehouse.create({data:{organizationId,name:'Count warehouse'}})).id;productId=(await prisma.product.create({data:{organizationId,name:'Count shirt',sku:randomUUID(),salePrice:'20',costPrice:'10'}})).id;});
afterEach(async()=>{const where={organizationId:{in:organizations}};await prisma.auditEvent.deleteMany({where});await prisma.stockCountLine.deleteMany({where});await prisma.stockCount.deleteMany({where});await prisma.inventoryTransaction.deleteMany({where});await prisma.product.deleteMany({where});await prisma.warehouse.deleteMany({where});await prisma.user.deleteMany({where});});
afterAll(async()=>{await prisma.organization.deleteMany({where:{id:{in:organizations}}});await prisma.$disconnect();});
const input=(expectedQuantity='0',countedQuantity='1.1250')=>({warehouseId,reason:'Physical count',occurredAt:day('20'),lines:[{productId,expectedQuantity,countedQuantity}]});
async function stock(quantity:string,date='01'){await prisma.inventoryTransaction.create({data:{organizationId,warehouseId,productId,type:'ADJUSTMENT',quantity,referenceType:'Fixture',referenceId:randomUUID(),occurredAt:day(date)}});}

it('posts exact count snapshots, adjustment links and audit, then replays before availability checks',async()=>{
  const unchanged=await prisma.product.create({data:{organizationId,name:'Unchanged',sku:randomUUID(),salePrice:'10',costPrice:'5'}});const key=randomUUID();
  const result=await service.post(organizationId,actorId,key,{...input(),lines:[...input().lines,{productId:unchanged.id,expectedQuantity:'0',countedQuantity:'0'}]});
  expect(result).toMatchObject({ok:true,replayed:false});if(!result.ok)throw Error('Count missing');expect(result.count.lines).toHaveLength(2);expect(result.count).not.toHaveProperty('idempotencyKey');
  expect(result.count.lines.find(row=>row.productId===productId)).toMatchObject({difference:'1.1250',inventoryTransactionId:expect.any(String)});expect(result.count.lines.find(row=>row.productId===unchanged.id)).toMatchObject({difference:'0.0000',inventoryTransactionId:null});
  expect(await prisma.inventoryTransaction.count({where:{organizationId,referenceType:'StockCount'}})).toBe(1);expect(await prisma.auditEvent.count({where:{organizationId,action:'STOCK_COUNT_POSTED'}})).toBe(1);
  await prisma.product.update({where:{id:productId},data:{active:false}});expect(await service.post(organizationId,actorId,key,input())).toMatchObject({ok:true,replayed:true,count:{id:result.count.id}});
  expect((await service.list(organizationId,{limit:25,offset:0})).total).toBe(1);expect((await service.list(otherId,{limit:25,offset:0})).counts).toEqual([]);expect((await service.list(organizationId,{limit:25,offset:25})).counts).toEqual([]);
});

it('rejects changed snapshots and serializes competing physical observations',async()=>{
  await stock('1');expect(await service.post(organizationId,actorId,randomUUID(),input())).toEqual({ok:false,reason:'STOCK_CHANGED'});
  const results=await Promise.all([service.post(organizationId,actorId,randomUUID(),input('1','0.5')),service.post(organizationId,actorId,randomUUID(),input('1','0.5'))]);
  expect(results.filter(result=>result.ok)).toHaveLength(1);expect(results.filter(result=>!result.ok)).toEqual([{ok:false,reason:'STOCK_CHANGED'}]);
  expect((await prisma.inventoryTransaction.aggregate({where:{organizationId,productId},_sum:{quantity:true}}))._sum.quantity!.toFixed(4)).toBe('0.5000');
});

it('replays same-key concurrent counts without duplicate adjustments',async()=>{
  const key=randomUUID();const results=await Promise.all([service.post(organizationId,actorId,key,input()),service.post(organizationId,actorId,key,input())]);expect(results.every(result=>result.ok)).toBe(true);expect(results.filter(result=>result.ok&&result.replayed)).toHaveLength(1);expect(await prisma.stockCount.count({where:{organizationId}})).toBe(1);
});

it('rejects a historical reduction that would consume stock needed by a later movement',async()=>{
  await stock('1','01');await stock('-1','10');await stock('1','15');
  expect(await service.post(organizationId,actorId,randomUUID(),{...input('1','0'),occurredAt:day('05')})).toEqual({ok:false,reason:'INSUFFICIENT_STOCK'});
  expect(await service.post(organizationId,actorId,randomUUID(),input('1','0.2500'))).toMatchObject({ok:true,count:{lines:[{difference:'-0.7500'}]}});
});

it('rejects inactive/foreign resources and actors and prevents out-of-range deltas',async()=>{
  const warehouse=await prisma.warehouse.create({data:{organizationId:otherId,name:'Foreign'}});expect(await service.post(organizationId,actorId,randomUUID(),{...input(),warehouseId:warehouse.id})).toEqual({ok:false,reason:'WAREHOUSE_UNAVAILABLE'});
  expect(await service.post(organizationId,randomUUID(),randomUUID(),input())).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});await prisma.user.update({where:{id:actorId},data:{role:'CASHIER'}});expect(await service.post(organizationId,actorId,randomUUID(),input())).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});await prisma.user.update({where:{id:actorId},data:{role:'ADMIN'}});
  expect(await service.post(organizationId,actorId,randomUUID(),{...input(),lines:[{...input().lines[0]!,productId:randomUUID()}]})).toEqual({ok:false,reason:'PRODUCT_UNAVAILABLE'});
  await stock('-999999999999999.9999');expect(await service.post(organizationId,actorId,randomUUID(),input('-999999999999999.9999','999999999999999.9999'))).toEqual({ok:false,reason:'COUNT_RANGE_EXCEEDED'});
});

it('rolls count headers, lines and adjustments back when the audit write fails',async()=>{
  const broken=new Proxy(prisma,{get(target,property){if(property==='$transaction')return (work:(tx:unknown)=>unknown,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(transaction,key){if(key==='auditEvent')return {create:async()=>{throw Error('Count audit unavailable');}};return Reflect.get(transaction,key);}})) as Promise<never>,options as never);return Reflect.get(target,property);}});
  await expect(createStockCountService(broken).post(organizationId,actorId,randomUUID(),input())).rejects.toThrow('Count audit unavailable');expect(await prisma.stockCount.count({where:{organizationId}})).toBe(0);expect(await prisma.inventoryTransaction.count({where:{organizationId}})).toBe(0);
});

it('enforces tenant foreign keys and exact discrepancy constraints independently of the service',async()=>{
  const header=await prisma.stockCount.create({data:{organizationId,warehouseId,actorUserId:actorId,idempotencyKey:randomUUID(),reason:'Constraint fixture',occurredAt:day('20')}});
  const line={organizationId,stockCountId:header.id,productId,productName:'Snapshot',sku:'COUNT',expectedQuantity:'0',countedQuantity:'0',difference:'0'};
  await expect(prisma.stockCountLine.create({data:{...line,difference:'1'}})).rejects.toThrow();await expect(prisma.stockCountLine.create({data:{...line,countedQuantity:'-1',difference:'-1'}})).rejects.toThrow();
  const foreign=await prisma.product.create({data:{organizationId:otherId,name:'Foreign',sku:randomUUID(),salePrice:'1',costPrice:'1'}});await expect(prisma.stockCountLine.create({data:{...line,productId:foreign.id}})).rejects.toMatchObject({code:'P2003'});
});
