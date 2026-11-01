import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPartyStatementService } from '../../src/modules/parties/statement.js';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient(),service=createPartyStatementService(prisma);
let organizationId:string,otherId:string,actorId:string,customerId:string,supplierId:string;
const day=(value:number)=>new Date(`2026-10-${String(value).padStart(2,'0')}T12:00:00.000Z`);
const query={from:day(5),to:day(7),limit:1,offset:0};
beforeAll(async()=>{
  organizationId=(await prisma.organization.create({data:{name:'Statement '+randomUUID()}})).id;otherId=(await prisma.organization.create({data:{name:'Foreign statement '+randomUUID()}})).id;
  actorId=(await prisma.user.create({data:{organizationId,name:'Statement owner',email:'statement@example.test',passwordHash:'unused',role:'ADMIN'}})).id;
  customerId=(await prisma.customer.create({data:{organizationId,name:'Statement customer',active:false}})).id;supplierId=(await prisma.supplier.create({data:{organizationId,name:'Statement supplier',active:false}})).id;
});
afterAll(async()=>{const where={organizationId:{in:[organizationId,otherId]}};await prisma.customerLedgerEntry.deleteMany({where});await prisma.supplierLedgerEntry.deleteMany({where});await prisma.customer.deleteMany({where});await prisma.supplier.deleteMany({where});await prisma.user.deleteMany({where});await prisma.organization.deleteMany({where:{id:{in:[organizationId,otherId]}}});await prisma.$disconnect();});

it('returns exact opening, period and closing balances with running amounts calculated before pagination',async()=>{
  const add=(type:string,amount:string,occurredAt:Date)=>prisma.customerLedgerEntry.create({data:{organizationId,customerId,actorUserId:actorId,type,amount,sourceType:type==='SALE_CREDIT'?'Sale':'SalesReturn',sourceId:randomUUID(),occurredAt}});
  await add('SALE_CREDIT','10',day(1));await add('SALE_CREDIT','20.1234',day(5));await add('RETURN_CREDIT','-2.0001',day(6));await add('RETURN_REVERSAL','2.0001',day(7));await add('SALE_CREDIT','100',day(20));
  expect(await service.read(organizationId,'customers',customerId,query)).toMatchObject({party:{active:false},opening:'10.0000',debits:'22.1235',credits:'2.0001',closing:'30.1234',total:3,rows:[{amount:'20.1234',balance:'30.1234'}]});
  expect(await service.read(organizationId,'customers',customerId,{...query,offset:1})).toMatchObject({rows:[{amount:'-2.0001',balance:'28.1233'}],total:3});
  expect(await service.read(organizationId,'customers',customerId,{...query,offset:2})).toMatchObject({rows:[{amount:'2.0001',balance:'30.1234'}]});
  expect(await service.read(organizationId,'customers',customerId,{...query,offset:3})).toMatchObject({rows:[],opening:'10.0000',closing:'30.1234',total:3});
  expect(await service.read(otherId,'customers',customerId,query)).toBeNull();
});

it('normalizes supplier credit, return, reversal and payment signs without losing archived account history',async()=>{
  const movements=[['PURCHASE_CREDIT','100',1],['PURCHASE_RETURN_CREDIT','20',5],['REVERSAL','30',6],['SUPPLIER_PAYMENT','10',7],['PURCHASE_CREDIT','5',20]] as const;
  for(const [type,amount,date] of movements)await prisma.supplierLedgerEntry.create({data:{organizationId,supplierId,actorUserId:actorId,type,amount,sourceType:'Fixture',sourceId:randomUUID(),occurredAt:day(date)}});
  expect(await service.read(organizationId,'suppliers',supplierId,{...query,limit:25})).toMatchObject({party:{active:false},opening:'100.0000',debits:'0.0000',credits:'60.0000',closing:'40.0000',total:3,rows:[{amount:'-20.0000',balance:'80.0000'},{amount:'-30.0000',balance:'50.0000'},{amount:'-10.0000',balance:'40.0000'}]});
  expect(await service.read(otherId,'suppliers',supplierId,query)).toBeNull();
});

it('distinguishes an empty account from an unavailable tenant-scoped party',async()=>{
  const empty=await prisma.customer.create({data:{organizationId,name:'Empty account'}});
  expect(await service.read(organizationId,'customers',empty.id,query)).toMatchObject({opening:'0.0000',debits:'0.0000',credits:'0.0000',closing:'0.0000',total:0,rows:[]});
  expect(await service.read(organizationId,'customers',randomUUID(),query)).toBeNull();expect(await service.read(organizationId,'suppliers',randomUUID(),query)).toBeNull();
});

it('keeps inclusive period boundaries identical under different database session time zones',async()=>{
  const readInZone=(zone:string)=>createPartyStatementService(new Proxy(prisma,{get(target,key){
    if(key==='$transaction')return (work:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:unknown)=>target.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('TimeZone',${zone},true)`;return work(tx);},options as never);
    return Reflect.get(target,key);
  }})).read(organizationId,'customers',customerId,query);
  const utc=await readInZone('UTC'),dubai=await readInZone('Asia/Dubai'),auckland=await readInZone('Pacific/Auckland');
  expect(dubai).toEqual(utc);expect(auckland).toEqual(utc);expect(utc).toMatchObject({opening:'10.0000',total:3,closing:'30.1234'});
});

it('enforces customer ledger tenant references, movement signs and unique posting sources at the database boundary',async()=>{
  const source={organizationId,customerId,actorUserId:actorId,type:'SALE_CREDIT',sourceType:'Sale',sourceId:randomUUID(),amount:'1',occurredAt:day(5)};
  await prisma.customerLedgerEntry.create({data:source});
  await expect(prisma.customerLedgerEntry.create({data:source})).rejects.toMatchObject({code:'P2002'});
  await expect(prisma.customerLedgerEntry.create({data:{...source,sourceId:randomUUID(),amount:'-1'}})).rejects.toThrow();
  await expect(prisma.customerLedgerEntry.create({data:{...source,sourceId:randomUUID(),amount:'0'}})).rejects.toThrow();
  const foreign=await prisma.customer.create({data:{organizationId:otherId,name:'Foreign account'}});
  await expect(prisma.customerLedgerEntry.create({data:{...source,sourceId:randomUUID(),customerId:foreign.id}})).rejects.toMatchObject({code:'P2003'});
  const foreignUser=await prisma.user.create({data:{organizationId:otherId,name:'Foreign actor',email:'foreign@example.test',passwordHash:'unused',role:'ADMIN'}});
  await expect(prisma.customerLedgerEntry.create({data:{...source,sourceId:randomUUID(),actorUserId:foreignUser.id}})).rejects.toMatchObject({code:'P2003'});
});
