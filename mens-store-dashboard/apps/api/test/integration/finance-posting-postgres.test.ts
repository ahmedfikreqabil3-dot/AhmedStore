import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createExpenseService } from '../../src/modules/finance/expense-service.js';
import { createShiftService } from '../../src/modules/finance/shift-service.js';
import { createShiftTotalsService, type TreasuryEntry } from '../../src/modules/finance/shift-totals.js';
import { createPrismaExpenseRepository } from '../../src/modules/finance/prisma-expense-repository.js';
import { createPrismaShiftRepository } from '../../src/modules/finance/prisma-shift-repository.js';
import { createPrismaShiftTotalsRepository } from '../../src/modules/finance/prisma-shift-totals-repository.js';
import { createApplicationServices } from '../../src/services.js';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const prisma=new PrismaClient(),expenseRepository=createPrismaExpenseRepository(prisma),shiftRepository=createPrismaShiftRepository(prisma),totalsRepository=createPrismaShiftTotalsRepository(prisma);
const expenses=createExpenseService(expenseRepository),totals=createShiftTotalsService(totalsRepository),shifts=createShiftService(shiftRepository,totals.summarize);
let organizations:string[]=[];let organizationId:string,otherId:string,ownerId:string,cashierId:string,financeId:string,managerId:string,foreignId:string;
const time=(clock:string)=>new Date(`2026-10-01T${clock}:00.000Z`),openedAt=time('10:00'),closedAt=time('14:00');
beforeAll(async()=>{for(const name of ['Finance adapter tests','Other finance adapter tests'])organizations.push((await prisma.organization.create({data:{name:`${name} ${randomUUID()}`}})).id);[organizationId,otherId]=organizations;});
beforeEach(async()=>{const create=(org:string,role:'ADMIN'|'FINANCE'|'MANAGER'|'CASHIER')=>prisma.user.create({data:{organizationId:org,name:'Finance fixture '+role,email:`${randomUUID()}@example.test`,passwordHash:'unused',role}});ownerId=(await create(organizationId,'ADMIN')).id;cashierId=(await create(organizationId,'CASHIER')).id;financeId=(await create(organizationId,'FINANCE')).id;managerId=(await create(organizationId,'MANAGER')).id;foreignId=(await create(otherId,'CASHIER')).id;});
afterEach(async()=>{const where={organizationId:{in:organizations}};await prisma.auditEvent.deleteMany({where});await prisma.treasuryTransaction.deleteMany({where});await prisma.expense.deleteMany({where});await prisma.shift.deleteMany({where});await prisma.user.deleteMany({where});});
afterAll(async()=>{await prisma.organization.deleteMany({where:{id:{in:organizations}}});await prisma.$disconnect();});
const expense=()=>({category:'Delivery',description:'Verified shipping cost',paymentMethod:'CASH' as const,amount:'12.3456',occurredAt:time('11:00')});
async function money(type:TreasuryEntry['type'],amount:string,occurredAt:Date,actorUserId=ownerId,org=organizationId,paymentMethod:TreasuryEntry['paymentMethod']='CASH'){await prisma.treasuryTransaction.create({data:{organizationId:org,type,paymentMethod,amount,sourceType:'TestFixture',sourceId:randomUUID(),actorUserId,occurredAt}});}
const zero={expectedCash:'0.0000',countedCash:'0.0000',cashDifference:'0.0000',discrepancyReason:null};

it('reads scoped expense history and exact whole-period totals before pagination',async()=>{
  for(const [amount,at,method] of [['12.3456',time('11:00'),'CASH'],['2.0001',time('13:00'),'CARD'],['999',new Date(time('13:00').getTime()+1),'CASH'],['888',new Date(time('11:00').getTime()-1),'CASH']] as const)expect(await expenses.post(organizationId,financeId,randomUUID(),{...expense(),amount,occurredAt:at,paymentMethod:method})).toMatchObject({ok:true});
  const history=createApplicationServices(prisma).expenseService;
  const query={from:time('11:00'),to:time('13:00'),limit:1,offset:0};
  expect(await history.list(organizationId,query)).toMatchObject({total:2,totalAmount:'14.3457',expenses:[{amount:'2.0001',paymentMethod:'CARD'}]});
  expect(await history.list(organizationId,{...query,offset:1})).toMatchObject({total:2,totalAmount:'14.3457',expenses:[{amount:'12.3456'}]});
  expect(await history.list(organizationId,{...query,offset:2})).toMatchObject({total:2,expenses:[]});
  expect(await history.list(otherId,query)).toMatchObject({total:0,totalAmount:'0.0000',expenses:[]});
});
function brokenAuditClient(){return new Proxy(prisma,{get(target,property){if(property==='$transaction')return (work:(tx:unknown)=>unknown,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(transaction,key){if(key==='auditEvent')return {create:async()=>{throw Error('Finance audit unavailable');}};return Reflect.get(transaction,key);}})) as Promise<never>,options as never);return Reflect.get(target,property);}});}

it('posts exact expenses with their outflow and audit and replays a scoped prior result',async()=>{
  const key=randomUUID();expect(await expenses.post(organizationId,financeId,key,expense())).toMatchObject({ok:true,replayed:false,expense:{amount:'12.3456'}});expect(await expenses.post(organizationId,financeId,key,expense())).toMatchObject({ok:true,replayed:true});expect(await expenseRepository.findByIdempotencyKey(otherId,key)).toBeNull();expect(await prisma.expense.count({where:{organizationId}})).toBe(1);expect((await prisma.treasuryTransaction.findFirstOrThrow({where:{organizationId,type:'EXPENSE_PAYMENT'}})).amount.toFixed(4)).toBe('12.3456');expect(await prisma.auditEvent.count({where:{organizationId,action:'EXPENSE_POSTED'}})).toBe(1);
});

it('replays simultaneous matching expense keys without duplicate cash movements',async()=>{
  let arrived=0;let release!:()=>void;const gate=new Promise<void>(done=>{release=done;});const concurrent=createExpenseService({...expenseRepository,findByIdempotencyKey:async()=>null,async post(command){if(++arrived===2)release();await gate;return expenseRepository.post(command);}});const key=randomUUID();const results=await Promise.all([concurrent.post(organizationId,financeId,key,expense()),concurrent.post(organizationId,financeId,key,expense())]);expect(results.every(row=>row.ok)).toBe(true);expect(results.filter(row=>row.ok&&row.replayed)).toHaveLength(1);expect(await prisma.expense.count({where:{organizationId}})).toBe(1);expect(await prisma.treasuryTransaction.count({where:{organizationId}})).toBe(1);
});

it('rechecks expense posting permission and rolls all writes back when audit fails',async()=>{
  for(const actor of [randomUUID(),cashierId,foreignId])expect(await expenses.post(organizationId,actor,randomUUID(),expense())).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});
  await expect(createExpenseService(createPrismaExpenseRepository(brokenAuditClient())).post(organizationId,financeId,randomUUID(),expense())).rejects.toThrow('Finance audit unavailable');expect(await prisma.expense.count({where:{organizationId}})).toBe(0);expect(await prisma.treasuryTransaction.count({where:{organizationId}})).toBe(0);
});

it('enforces one open shift per scoped user under concurrent opening and at the database boundary',async()=>{
  expect(await shifts.current(organizationId,ownerId)).toBeNull();let arrived=0;let release!:()=>void;const gate=new Promise<void>(done=>{release=done;});const concurrent=createShiftService({...shiftRepository,async create(org,user,at){if(++arrived===2)release();await gate;return shiftRepository.create(org,user,at);}},totals.summarize);const results=await Promise.all([concurrent.open(organizationId,ownerId,openedAt),concurrent.open(organizationId,ownerId,openedAt)]);expect(results.every(row=>row.ok)).toBe(true);expect(new Set(results.map(row=>row.ok ? row.shift.id : null)).size).toBe(1);const current=await shifts.current(organizationId,ownerId);expect(current).toMatchObject({status:'OPEN',expectedCash:null,countedCash:null,cashDifference:null});expect(await prisma.shift.count({where:{organizationId}})).toBe(1);expect(await prisma.auditEvent.count({where:{organizationId,action:'SHIFT_OPENED'}})).toBe(1);
  await expect(prisma.shift.create({data:{organizationId,userId:ownerId,openedAt}})).rejects.toMatchObject({code:'P2002'});await expect(prisma.shift.create({data:{organizationId:otherId,userId:ownerId,openedAt}})).rejects.toMatchObject({code:'P2003'});expect(await shifts.open(organizationId,ownerId,openedAt)).toEqual({ok:false,reason:'SHIFT_ALREADY_OPEN'});expect(await shiftRepository.findOpen(otherId,ownerId)).toBeNull();expect(await shiftRepository.findById(otherId,current!.id)).toBeNull();
});

it('rejects inactive, cross-tenant or unauthorized owners before opening a shift',async()=>{
  expect(await shifts.open(organizationId,randomUUID(),openedAt)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});expect(await shifts.open(organizationId,foreignId,openedAt)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});expect(await shifts.open(organizationId,managerId,openedAt)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});await prisma.user.update({where:{id:ownerId},data:{active:false}});expect(await shifts.open(organizationId,ownerId,openedAt)).toEqual({ok:false,reason:'ACTOR_UNAVAILABLE'});expect(await prisma.shift.count({where:{organizationId}})).toBe(0);
});

it('calculates personal shift totals by owner and half-open time boundary while retaining organization finance totals',async()=>{
  const opened=await shifts.open(organizationId,ownerId,openedAt);if(!opened.ok)throw Error(opened.reason);
  await money('SALE_RECEIPT','100',openedAt);await money('RETURN_REFUND','10',time('11:00'));await money('EXPENSE_PAYMENT','5',time('12:00'));await money('PURCHASE_PAYMENT','20',time('13:00'));await money('PURCHASE_PAYMENT_REVERSAL','2',time('13:10'));await money('PURCHASE_RETURN_REFUND','3',time('13:20'));await money('RETURN_REFUND_REVERSAL','1',time('13:30'));await money('SALE_RECEIPT','40',time('13:40'),ownerId,organizationId,'CARD');
  await money('SALE_RECEIPT','1000',closedAt);await money('SALE_RECEIPT','2000',time('09:59'));await money('SALE_RECEIPT','500',time('11:00'),cashierId);await money('SALE_RECEIPT','900',time('11:00'),foreignId,otherId);
  expect(await totals.summarize(organizationId,openedAt,closedAt)).toMatchObject({ok:true,totals:{net:'611.0000'}});expect(await shifts.summary(organizationId,ownerId,false,opened.shift.id,closedAt)).toMatchObject({ok:true,totals:{net:'111.0000',methods:expect.arrayContaining([{method:'CASH',receipts:'106.0000',refunds:'35.0000',net:'71.0000'}])}});expect(await shifts.listClosed(organizationId)).toEqual([]);
  expect(await shifts.close(organizationId,ownerId,opened.shift.id,closedAt,'70','Count shortage')).toMatchObject({ok:true,shift:{status:'CLOSED',expectedCash:'71.0000',countedCash:'70.0000',cashDifference:'-1.0000',discrepancyReason:'Count shortage'}});
  expect(await shifts.summary(organizationId,financeId,true,opened.shift.id,time('15:00'))).toMatchObject({ok:true,totals:{net:'111.0000'}});expect(await shifts.current(organizationId,ownerId)).toBeNull();expect(await shifts.listClosed(otherId)).toEqual([]);expect(await shifts.listClosed(organizationId)).toHaveLength(1);expect(await prisma.auditEvent.count({where:{organizationId,action:'SHIFT_CLOSED'}})).toBe(1);
});

it('scopes conditional close/review transitions and audits each completed action once',async()=>{
  const opened=await shifts.open(organizationId,ownerId,openedAt);if(!opened.ok)throw Error(opened.reason);const id=opened.shift.id;
  expect(await shiftRepository.review(organizationId,id,financeId,closedAt)).toBeNull();expect(await shiftRepository.close(organizationId,id,randomUUID(),closedAt,zero)).toBeNull();expect(await shiftRepository.close(organizationId,id,managerId,closedAt,zero)).toBeNull();expect(await shiftRepository.close(organizationId,id,cashierId,closedAt,zero)).toBeNull();expect(await shiftRepository.close(organizationId,id,ownerId,closedAt,zero)).toMatchObject({status:'CLOSED',expectedCash:'0.0000'});expect(await shiftRepository.close(organizationId,id,ownerId,closedAt,zero)).toBeNull();
  expect(await shiftRepository.review(organizationId,id,randomUUID(),closedAt)).toBeNull();expect(await shiftRepository.review(organizationId,id,managerId,closedAt)).toBeNull();expect(await shifts.review(organizationId,financeId,id,time('15:00'))).toMatchObject({ok:true,shift:{status:'REVIEWED',reviewedByUserId:financeId}});expect(await shiftRepository.review(organizationId,id,financeId,time('15:01'))).toBeNull();expect((await shifts.listClosed(organizationId))[0]!.status).toBe('REVIEWED');expect(await prisma.auditEvent.count({where:{organizationId,action:'SHIFT_REVIEWED'}})).toBe(1);
  expect(await shifts.open(organizationId,ownerId,time('15:00'))).toMatchObject({ok:true});expect(await prisma.shift.count({where:{organizationId}})).toBe(2);
});

it('rolls shift opening, closing and review back if their audit cannot be saved',async()=>{
  const broken=createShiftService(createPrismaShiftRepository(brokenAuditClient()),totals.summarize);await expect(broken.open(organizationId,ownerId,openedAt)).rejects.toThrow('Finance audit unavailable');expect(await prisma.shift.count({where:{organizationId}})).toBe(0);const opened=await shifts.open(organizationId,ownerId,openedAt);if(!opened.ok)throw Error(opened.reason);
  await expect(broken.close(organizationId,ownerId,opened.shift.id,closedAt,'0',null)).rejects.toThrow('Finance audit unavailable');expect((await prisma.shift.findUniqueOrThrow({where:{id:opened.shift.id}})).status).toBe('OPEN');expect(await shifts.close(organizationId,ownerId,opened.shift.id,closedAt,'0',null)).toMatchObject({ok:true});await expect(broken.review(organizationId,financeId,opened.shift.id,time('15:00'))).rejects.toThrow('Finance audit unavailable');expect((await prisma.shift.findUniqueOrThrow({where:{id:opened.shift.id}})).status).toBe('CLOSED');expect(await prisma.auditEvent.count({where:{organizationId,action:'SHIFT_REVIEWED'}})).toBe(0);
});
