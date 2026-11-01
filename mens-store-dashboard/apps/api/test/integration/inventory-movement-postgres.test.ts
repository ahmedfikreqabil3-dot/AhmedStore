import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createInventoryMovementService } from '../../src/modules/inventory/movement.js';
import { createPrismaInventoryMovementRepository } from '../../src/modules/inventory/movement-repository.js';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient();const repository=createPrismaInventoryMovementRepository(prisma);const service=createInventoryMovementService(repository);
let organizationId:string;let actorUserId:string;let warehouseId:string;let productId:string;
const day=(date:string)=>new Date(`2026-10-${date}T12:00:00.000Z`);
beforeAll(async()=>{organizationId=(await prisma.organization.create({data:{name:`Movement tests ${randomUUID()}`}})).id;});
beforeEach(async()=>{
  actorUserId=(await prisma.user.create({data:{organizationId,name:'Stock manager',email:`${randomUUID()}@example.test`,passwordHash:'unused',role:'ADMIN'}})).id;
  warehouseId=(await prisma.warehouse.create({data:{organizationId,name:'Movement warehouse'}})).id;
  productId=(await prisma.product.create({data:{organizationId,name:'Stock item',sku:randomUUID(),salePrice:'20',costPrice:'10'}})).id;
});
afterEach(async()=>{const where={organizationId};await prisma.auditEvent.deleteMany({where});await prisma.inventoryTransaction.deleteMany({where});await prisma.product.deleteMany({where});await prisma.warehouse.deleteMany({where});await prisma.user.deleteMany({where});});
afterAll(async()=>{await prisma.organization.delete({where:{id:organizationId}});await prisma.$disconnect();});
const input=()=>({productId,warehouseId,type:'OPENING_BALANCE' as const,quantity:'5.2500',referenceType:'Opening',referenceId:'COUNT-001',occurredAt:day('01')});
const command=()=>({id:randomUUID(),organizationId,actorUserId,idempotencyKey:randomUUID(),...input()});
async function fixture(quantity:string,date:string){await prisma.inventoryTransaction.create({data:{organizationId,warehouseId,productId,type:'ADJUSTMENT',quantity,referenceType:'TestFixture',referenceId:randomUUID(),occurredAt:day(date)}});}

it('posts an exact immutable opening with audit and replays before checking changed master data',async()=>{
  const key=randomUUID();const first=await service.post(organizationId,actorUserId,key,input());expect(first).toMatchObject({ok:true,replayed:false,movement:{quantity:'5.2500'}});
  await prisma.product.update({where:{id:productId},data:{active:false}});
  expect(await service.post(organizationId,actorUserId,key,input())).toMatchObject({ok:true,replayed:true});
  expect(await repository.post({...command(),idempotencyKey:key})).toMatchObject({ok:true,replayed:true});
  expect(await prisma.inventoryTransaction.count({where:{organizationId}})).toBe(1);expect(await prisma.auditEvent.count({where:{organizationId}})).toBe(1);
  expect(await repository.findProduct(productId,randomUUID())).toBeNull();expect(await repository.findWarehouse(warehouseId,randomUUID())).toBeNull();
});

it('serializes competing openings and prevents another opening after any existing movement',async()=>{
  const results=await Promise.all([repository.post(command()),repository.post(command())]);
  expect(results.filter(value=>value.ok)).toHaveLength(1);expect(results.filter(value=>!value.ok)).toEqual([{ok:false,reason:'OPENING_ALREADY_EXISTS'}]);
  expect(await prisma.inventoryTransaction.count({where:{organizationId}})).toBe(1);
});

it('replays simultaneous matching keys without duplicate movements',async()=>{
  const key=randomUUID();const results=await Promise.all([repository.post({...command(),idempotencyKey:key}),repository.post({...command(),idempotencyKey:key})]);
  expect(results.every(row=>row.ok)).toBe(true);expect(results.filter(row=>row.ok&&row.replayed)).toHaveLength(1);
});

it('checks current and historical stock before a negative adjustment and permits exact reductions',async()=>{
  expect(await service.post(organizationId,actorUserId,randomUUID(),{...input(),type:'ADJUSTMENT',quantity:'-1'})).toEqual({ok:false,reason:'INSUFFICIENT_STOCK'});
  await fixture('1','01');await fixture('-1','10');await fixture('1','15');
  expect(await repository.post({...command(),type:'ADJUSTMENT',quantity:'-1',occurredAt:day('05')})).toEqual({ok:false,reason:'INSUFFICIENT_STOCK'});
  expect(await repository.post({...command(),type:'ADJUSTMENT',quantity:'-0.5000',occurredAt:day('20')})).toMatchObject({ok:true,movement:{quantity:'-0.5000'}});
  expect(await repository.post({...command(),type:'ADJUSTMENT',quantity:'0.2500',occurredAt:day('20')})).toMatchObject({ok:true,movement:{quantity:'0.2500'}});
});

it('rejects unavailable resources and actors in the transaction',async()=>{
  expect(await repository.post({...command(),productId:randomUUID()})).toEqual({ok:false,reason:'PRODUCT_UNAVAILABLE'});
  expect(await repository.post({...command(),warehouseId:randomUUID()})).toEqual({ok:false,reason:'WAREHOUSE_UNAVAILABLE'});
  expect(await repository.post({...command(),actorUserId:randomUUID()})).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});
  await prisma.user.update({where:{id:actorUserId},data:{role:'CASHIER'}});expect(await repository.post(command())).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});
  await prisma.user.update({where:{id:actorUserId},data:{role:'ADMIN'}});
  expect(await repository.post({...command(),quantity:'-1'})).toEqual({ok:false,reason:'INVALID_OPENING_BALANCE'});
});

it('rolls the movement back when audit persistence fails',async()=>{
  const broken=new Proxy(prisma,{get(target,property){if(property==='$transaction')return (work:(tx:unknown)=>unknown,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(transaction,key){if(key==='auditEvent')return {create:async()=>{throw Error('Audit unavailable');}};return Reflect.get(transaction,key);}})) as Promise<never>,options as never);return Reflect.get(target,property);}});
  await expect(createPrismaInventoryMovementRepository(broken).post(command())).rejects.toThrow('Audit unavailable');
  expect(await prisma.inventoryTransaction.count({where:{organizationId}})).toBe(0);
});
