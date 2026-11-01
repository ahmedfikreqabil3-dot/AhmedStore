import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {PrismaClient} from '@prisma/client';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from 'vitest';
import {createCustomerImportService} from '../../src/modules/parties/customer-import.js';
import {createApplicationServices} from '../../src/services.js';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient(),service=createCustomerImportService(prisma);let organizations:string[]=[],organizationId:string,otherId:string,actorId:string,foreignId:string;
beforeAll(async()=>{for(const name of ['Import customers','Other customer import'])organizations.push((await prisma.organization.create({data:{name:name+randomUUID()}})).id);[organizationId,otherId]=organizations;});
beforeEach(async()=>{actorId=(await prisma.user.create({data:{organizationId,name:'Import admin',email:randomUUID()+'@example.test',passwordHash:'unused',role:'ADMIN'}})).id;foreignId=(await prisma.user.create({data:{organizationId:otherId,name:'Foreign admin',email:randomUUID()+'@example.test',passwordHash:'unused',role:'ADMIN'}})).id;});
afterEach(async()=>{const where={organizationId:{in:organizations}};await prisma.auditEvent.deleteMany({where});await prisma.dataImport.deleteMany({where});await prisma.customer.deleteMany({where});await prisma.user.deleteMany({where});});
afterAll(async()=>{await prisma.organization.deleteMany({where:{id:{in:organizations}}});await prisma.$disconnect();});
async function file(name='Imported customer'){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Customers');sheet.addRow(['Name','Phone','Email','Address','Notes','Credit Limit']);sheet.addRow([name,'123','import@example.test','القاهرة','فحص','0']);sheet.addRow([name+' two','','','','','12.1234']);return Buffer.from(await book.xlsx.writeBuffer());}

it('previews without writing then atomically imports exact customers, a durable batch and an audit',async()=>{
  const workbook=await file(),key=randomUUID(),composed=createApplicationServices(prisma).customerService.imports;
  expect(await composed.preview(organizationId,workbook)).toMatchObject({valid:true});expect(await prisma.customer.count({where:{organizationId}})).toBe(0);
  expect(await composed.import(organizationId,actorId,key,workbook)).toEqual({ok:true,imported:2,replayed:false});
  expect(await composed.import(organizationId,actorId,key,workbook)).toEqual({ok:true,imported:2,replayed:true});
  const rows=await prisma.customer.findMany({where:{organizationId},orderBy:{name:'asc'}});expect(rows.map(row=>row.creditLimit.toFixed(4))).toEqual(['0.0000','12.1234']);expect(rows.every(row=>row.active&&row.version===1&&row.legacyId===null)).toBe(true);
  expect(await prisma.dataImport.count({where:{organizationId}})).toBe(1);expect(await prisma.auditEvent.count({where:{organizationId,action:'CUSTOMERS_IMPORTED'}})).toBe(1);
  expect(await service.import(organizationId,actorId,key,await file('Changed'))).toEqual({ok:false,reason:'IDEMPOTENCY_KEY_CONFLICT'});
});

it('scopes duplicate checks and batch keys to the tenant and includes archived existing customers',async()=>{
  const workbook=await file(),key=randomUUID();await prisma.customer.create({data:{organizationId,name:'IMPORTED CUSTOMER',phone:'123',email:'IMPORT@example.test',active:false}});
  expect(await service.preview(organizationId,workbook)).toMatchObject({valid:false,errors:[{row:2,message:'CUSTOMER_EXISTS'}]});expect(await service.preview(otherId,workbook)).toMatchObject({valid:true});
  expect(await service.import(organizationId,actorId,key,workbook)).toMatchObject({ok:false,reason:'INVALID_IMPORT'});expect(await service.import(otherId,foreignId,key,workbook)).toMatchObject({ok:true,imported:2});expect(await prisma.dataImport.count({where:{organizationId}})).toBe(0);
});

it('rejects invalid rows or actors without partial customer, batch or audit records',async()=>{
  expect(await service.preview(organizationId,Buffer.from('invalid'))).toMatchObject({valid:false});expect(await service.import(organizationId,actorId,randomUUID(),Buffer.from('invalid'))).toMatchObject({ok:false,reason:'INVALID_IMPORT'});
  const workbook=await file();for(const actor of [foreignId,randomUUID()])expect(await service.import(organizationId,actor,randomUUID(),workbook)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});
  await prisma.user.update({where:{id:actorId},data:{role:'CASHIER'}});expect(await service.import(organizationId,actorId,randomUUID(),workbook)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});await prisma.user.update({where:{id:actorId},data:{role:'ADMIN',active:false}});expect(await service.import(organizationId,actorId,randomUUID(),workbook)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});
  expect(await prisma.customer.count({where:{organizationId}})).toBe(0);expect(await prisma.dataImport.count({where:{organizationId}})).toBe(0);
});

it('rolls customer creation and the durable import batch back when audit persistence fails',async()=>{
  const broken=new Proxy(prisma,{get(target,key){if(key==='$transaction')return (work:(tx:unknown)=>unknown,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(transaction,property){if(property==='auditEvent')return {create:async()=>{throw Error('Import audit unavailable');}};return Reflect.get(transaction,property);}})) as Promise<never>,options as never);return Reflect.get(target,key);}});
  await expect(createCustomerImportService(broken).import(organizationId,actorId,randomUUID(),await file())).rejects.toThrow('Import audit unavailable');expect(await prisma.customer.count({where:{organizationId}})).toBe(0);expect(await prisma.dataImport.count({where:{organizationId}})).toBe(0);
});

function overlapped(){let arrived=0;let release!:()=>void;const gate=new Promise<void>(done=>{release=done;});return new Proxy(prisma,{get(target,key){if(key==='$transaction')return (work:(tx:unknown)=>unknown,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(transaction,property){if(property==='dataImport')return new Proxy(transaction.dataImport,{get(model,field){if(field==='findUnique')return async(...args:unknown[])=>{const prior=await (model.findUnique as (...args:unknown[])=>Promise<unknown>)(...args);if(arrived<2){if(++arrived===2)release();await gate;}return prior;};return Reflect.get(model,field);}});return Reflect.get(transaction,property);}})) as Promise<never>,options as never);return Reflect.get(target,key);}});}
it('replays simultaneous identical batch keys once without duplicate customers',async()=>{
  const concurrent=createCustomerImportService(overlapped()),workbook=await file(),key=randomUUID();const results=await Promise.all([concurrent.import(organizationId,actorId,key,workbook),concurrent.import(organizationId,actorId,key,workbook)]);expect(results.filter(row=>row.ok)).toHaveLength(2);expect(results.filter(row=>row.ok&&row.replayed)).toHaveLength(1);expect(await prisma.customer.count({where:{organizationId}})).toBe(2);expect(await prisma.dataImport.count({where:{organizationId}})).toBe(1);
});
it('rechecks duplicates inside the transaction when different import keys race for the same identities',async()=>{
  const concurrent=createCustomerImportService(overlapped()),workbook=await file();const results=await Promise.all([concurrent.import(organizationId,actorId,randomUUID(),workbook),concurrent.import(organizationId,actorId,randomUUID(),workbook)]);expect(results.filter(row=>row.ok)).toHaveLength(1);expect(results.filter(row=>!row.ok)).toMatchObject([{ok:false,reason:'INVALID_IMPORT'}]);expect(await prisma.customer.count({where:{organizationId}})).toBe(2);expect(await prisma.dataImport.count({where:{organizationId}})).toBe(1);
});
