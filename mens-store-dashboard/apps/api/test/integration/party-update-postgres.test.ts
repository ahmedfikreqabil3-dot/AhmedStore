import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createPartyUpdateService, createPrismaPartyUpdateRepository } from '../../src/modules/parties/update.js';

if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient();const service=createPartyUpdateService(createPrismaPartyUpdateRepository(prisma));
let organizations:string[]=[];let organizationId:string;let otherId:string;let actorId:string;
const fields={name:'Test party',phone:null,email:null,address:null,notes:null};
beforeAll(async()=>{for(const name of ['Party update tests','Other party tests'])organizations.push((await prisma.organization.create({data:{name:`${name} ${randomUUID()}`}})).id);[organizationId,otherId]=organizations;});
beforeEach(async()=>{actorId=(await prisma.user.create({data:{organizationId,name:'Editor',email:`${randomUUID()}@example.test`,passwordHash:'unused-test-hash',role:'ADMIN'}})).id;});
afterEach(async()=>{const where={organizationId:{in:organizations}};await prisma.auditEvent.deleteMany({where});await prisma.customer.deleteMany({where});await prisma.supplier.deleteMany({where});await prisma.user.deleteMany({where});});
afterAll(async()=>{await prisma.organization.deleteMany({where:{id:{in:organizations}}});await prisma.$disconnect();});

it('saves exact credit limits, version and actor audit in one transaction',async()=>{
  const customer=await prisma.customer.create({data:{organizationId,...fields}});
  expect(await service.customer(organizationId,actorId,customer.id,{...fields,name:'Updated customer',creditLimit:'12345.6789',version:1})).toMatchObject({ok:true,party:{creditLimit:'12345.6789',version:2}});
  const audit=await prisma.auditEvent.findFirstOrThrow({where:{organizationId,entityId:customer.id}});expect(audit.actorUserId).toBe(actorId);expect(audit.action).toBe('CUSTOMER_UPDATED');
});

it('rejects cross-organization updates and leaves both records and audits unchanged',async()=>{
  const customer=await prisma.customer.create({data:{organizationId:otherId,...fields}});const supplier=await prisma.supplier.create({data:{organizationId:otherId,...fields}});
  expect(await service.customer(organizationId,actorId,customer.id,{...fields,creditLimit:'10',version:1})).toEqual({ok:false,reason:'PARTY_NOT_FOUND'});
  expect(await service.supplier(organizationId,actorId,supplier.id,{...fields,version:1})).toEqual({ok:false,reason:'PARTY_NOT_FOUND'});
  expect(await prisma.customer.findUnique({where:{id:customer.id}})).toEqual(customer);expect(await prisma.supplier.findUnique({where:{id:supplier.id}})).toEqual(supplier);expect(await prisma.auditEvent.count({where:{organizationId}})).toBe(0);
});

it('allows one concurrent supplier edit, blocks stale versions and rolls back duplicate-name errors',async()=>{
  const supplier=await prisma.supplier.create({data:{organizationId,...fields}});await prisma.supplier.create({data:{organizationId,...fields,name:'Reserved name'}});
  const results=await Promise.all(['First update','Second update'].map(name=>service.supplier(organizationId,actorId,supplier.id,{...fields,name,version:1})));
  expect(results.filter(result=>result.ok)).toHaveLength(1);expect(results.filter(result=>!result.ok)).toEqual([{ok:false,reason:'VERSION_CONFLICT'}]);
  expect(await service.supplier(organizationId,actorId,supplier.id,{...fields,version:1})).toEqual({ok:false,reason:'VERSION_CONFLICT'});
  expect(await service.supplier(organizationId,actorId,supplier.id,{...fields,name:'Reserved name',version:2})).toEqual({ok:false,reason:'PARTY_EXISTS'});
  expect((await prisma.supplier.findUniqueOrThrow({where:{id:supplier.id}})).version).toBe(2);expect(await prisma.auditEvent.count({where:{organizationId,entityId:supplier.id}})).toBe(1);
});

it('rolls back profile and version if recording the actor audit fails',async()=>{
  const customer=await prisma.customer.create({data:{organizationId,...fields}});const supplier=await prisma.supplier.create({data:{organizationId,...fields}});
  await expect(service.customer(organizationId,randomUUID(),customer.id,{...fields,name:'Must rollback',creditLimit:'100',version:1})).rejects.toMatchObject({code:'P2003'});
  await expect(service.supplier(organizationId,randomUUID(),supplier.id,{...fields,name:'Must rollback',version:1})).rejects.toMatchObject({code:'P2003'});
  expect(await prisma.customer.findUnique({where:{id:customer.id}})).toEqual(customer);expect(await prisma.supplier.findUnique({where:{id:supplier.id}})).toEqual(supplier);
});
