import {createSaleDraftService} from '../../src/modules/sales/drafts.js';
import {branchContext} from '../../src/modules/identity/branch-scope.js';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { beforeEach,afterEach,afterAll,expect,it } from 'vitest';
import { createApplicationServices } from '../../src/services.js';
import { createTreasuryService } from '../../src/modules/finance/treasury-service.js';
import { treasuryAccountsSchema,treasuryLedgerSchema,type SettlementInput } from '@ahmed-store/contracts';
if(!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1)))throw Error('Separate test database required');
const db=new PrismaClient(),services=createApplicationServices(db),treasury=services.treasuryService;
let org:string,other:string,user:string,customer:string,supplier:string,warehouse:string,product:string;
const reason='Verified treasury test',now=()=>new Date();
beforeEach(async()=>{
  org=(await db.organization.create({data:{name:'Treasury '+randomUUID()}})).id;other=(await db.organization.create({data:{name:'Other treasury '+randomUUID()}})).id;
  user=(await db.user.create({data:{organizationId:org,name:'Treasury owner',email:'treasury@example.test',passwordHash:'unused',role:'ADMIN'}})).id;
  customer=(await db.customer.create({data:{organizationId:org,name:'Treasury customer'}})).id;supplier=(await db.supplier.create({data:{organizationId:org,name:'Treasury supplier'}})).id;
  warehouse=(await db.warehouse.create({data:{organizationId:org,name:'Treasury warehouse'}})).id;product=(await db.product.create({data:{organizationId:org,name:'Treasury product',sku:'TREASURY',salePrice:'10',costPrice:'5'}})).id;
  await db.inventoryTransaction.create({data:{organizationId:org,warehouseId:warehouse,productId:product,type:'OPENING_BALANCE',quantity:'100',referenceType:'Fixture',referenceId:randomUUID(),occurredAt:new Date(Date.now()-86400000)}});
});
afterEach(async()=>{
  const where={organizationId:{in:[org,other]}};
  await db.settlementAllocation.deleteMany({where});await db.partySettlement.deleteMany({where});await db.treasuryTransfer.deleteMany({where});
  await db.customerLedgerEntry.deleteMany({where});await db.supplierLedgerEntry.deleteMany({where});await db.treasuryTransaction.deleteMany({where});await db.auditEvent.deleteMany({where});await db.shift.deleteMany({where});await db.inventoryTransaction.deleteMany({where});
  await db.returnPayment.deleteMany({where:{salesReturn:where}});await db.returnLine.deleteMany({where:{salesReturn:where}});await db.salesReturn.deleteMany({where});
  await db.purchaseReturnSettlement.deleteMany({where:{purchaseReturn:where}});await db.purchaseReturnLine.deleteMany({where:{purchaseReturn:where}});await db.purchaseReturn.deleteMany({where});
  await db.salePayment.deleteMany({where:{sale:where}});await db.saleLine.deleteMany({where:{sale:where}});await db.sale.deleteMany({where});await db.purchasePayment.deleteMany({where:{purchase:where}});await db.purchaseLine.deleteMany({where:{purchase:where}});await db.purchase.deleteMany({where});
  await db.saleDraft.deleteMany({where});await db.expense.deleteMany({where});await db.product.deleteMany({where});await db.category.deleteMany({where});await db.customer.deleteMany({where});await db.supplier.deleteMany({where});await db.warehouse.deleteMany({where});await db.user.deleteMany({where});await db.organization.deleteMany({where:{id:{in:[org,other]}}});
});
afterAll(()=>db.$disconnect());
const account=(openingBalance='100.1234',paymentMethod:'CASH'|'CARD'|'WALLET'|'INSTAPAY'='CASH',name=randomUUID())=>treasury.createAccount(org,user,randomUUID(),{name,paymentMethod,openingBalance,reason});
async function sale(){const result=await services.salesService.post(org,user,randomUUID(),{customerId:customer,warehouseId:warehouse,lines:[{productId:product,quantity:'10',unitPrice:'10',discount:'0'}],payments:[{method:'CREDIT',amount:'100'}],occurredAt:new Date(Date.now()-1000)});if(!result.ok)throw Error(result.reason);return db.sale.findUniqueOrThrow({where:{id:result.sale.id},include:{lines:true}});}
async function purchase(){const result=await services.purchaseService.post(org,user,randomUUID(),{supplierId:supplier,warehouseId:warehouse,lines:[{productId:product,quantity:'10',unitCost:'10'}],payments:[{method:'CREDIT',amount:'100'}],occurredAt:new Date(Date.now()-1000)});if(!result.ok)throw Error(result.reason);return db.purchase.findUniqueOrThrow({where:{id:result.purchase.id},include:{lines:true}});}
const settlement=(kind:SettlementInput['kind'],accountId:string,amount='20.1234'):SettlementInput=>({kind,partyId:kind==='customers'?customer:supplier,accountId,amount,reason,allocations:[]});
const balances=async()=>Object.fromEntries((await treasury.accounts(org)).accounts.map(row=>[row.id,row.balance]));

it('creates exact audited accounts, protects original commands and maps legacy postings to method defaults',async()=>{
  const key=randomUUID(),input={name:'Operating cash',paymentMethod:'CASH' as const,openingBalance:'10.1234',reason};
  const first=await treasury.createAccount(org,user,key,input);expect(await treasury.createAccount(org,user,key,input)).toMatchObject({...first,replayed:true});
  await expect(treasury.createAccount(org,user,key,{...input,openingBalance:'11'})).rejects.toMatchObject({reason:'IDEMPOTENCY_KEY_CONFLICT'});
  await expect(treasury.createAccount(org,user,randomUUID(),input)).rejects.toMatchObject({reason:'ACCOUNT_NAME_EXISTS'});
  await account('0');expect(treasuryAccountsSchema.parse(await treasury.accounts(org)).accounts).toEqual(expect.arrayContaining([expect.objectContaining({id:first.id,balance:'10.1234'})]));
  await db.treasuryTransaction.create({data:{organizationId:org,actorUserId:user,type:'SALE_RECEIPT',paymentMethod:'CARD',amount:'7.0001',sourceType:'Fixture',sourceId:randomUUID(),occurredAt:now()}});
  expect((await treasury.accounts(org)).accounts).toEqual(expect.arrayContaining([expect.objectContaining({paymentMethod:'CARD',isDefault:true,balance:'7.0001'})]));
  expect(await treasury.accounts(other)).toEqual({accounts:[]});
});

it('posts paired transfers once and rejects overspending, foreign accounts and changed commands',async()=>{
  const source=await account(),destination=await account('0','CARD');const key=randomUUID(),input={fromAccountId:source.id,toAccountId:destination.id,amount:'20.1234',reason};
  const first=await treasury.transfer(org,user,key,input);expect(first.replayed).toBe(false);expect(await treasury.transfer(org,user,key,input)).toMatchObject({id:first.id,replayed:true});
  expect(await balances()).toMatchObject({[source.id]:'80.0000',[destination.id]:'20.1234'});
  expect(await db.treasuryTransaction.count({where:{organizationId:org,sourceType:'TreasuryTransfer'}})).toBe(2);
  await expect(treasury.transfer(org,user,key,{...input,amount:'1'})).rejects.toMatchObject({reason:'IDEMPOTENCY_KEY_CONFLICT'});
  for(const patch of [{amount:'81'},{toAccountId:randomUUID()},{toAccountId:source.id}])await expect(treasury.transfer(org,user,randomUUID(),{...input,...patch})).rejects.toMatchObject({reason:patch.amount?'INSUFFICIENT_FUNDS':'ACCOUNT_UNAVAILABLE'});
  await db.treasuryAccount.update({where:{id:destination.id},data:{active:false}});await expect(treasury.transfer(org,user,randomUUID(),input)).rejects.toMatchObject({reason:'ACCOUNT_UNAVAILABLE'});
});

it('collects customer debt and pays suppliers with exact invoice allocations and immutable statements',async()=>{
  const source=await account('100'),sold=await sale(),bought=await purchase();
  for(const [kind,document] of [['customers',sold],['suppliers',bought]] as const){
    const input={...settlement(kind,source.id),allocations:[{documentId:document.id,amount:'10.0001'}]},key=randomUUID();
    expect((await treasury.invoices(org,{kind,partyId:input.partyId})).invoices).toEqual([{id:document.id,occurredAt:document.occurredAt,balance:'100.0000'}]);
    const first=await treasury.settle(org,user,key,input);expect(await treasury.settle(org,user,key,input)).toMatchObject({id:first.id,replayed:true});
    await expect(treasury.settle(org,user,key,{...input,amount:'1'})).rejects.toMatchObject({reason:'IDEMPOTENCY_KEY_CONFLICT'});
    expect((await treasury.parties(org,{kind,search:'Treasury'})).parties).toEqual([{id:input.partyId,name:kind==='customers'?'Treasury customer':'Treasury supplier',balance:'79.8766'}]);
    expect((await treasury.invoices(org,{kind,partyId:input.partyId})).invoices[0]!.balance).toBe('89.9999');
  }
  expect((await balances())[source.id]).toBe('100.0000');expect(await db.settlementAllocation.count({where:{organizationId:org}})).toBe(2);
  const query={from:new Date(Date.now()-86400000),to:new Date(),limit:1,offset:0};
  const ledger=treasuryLedgerSchema.parse(await treasury.ledger(org,source.id,query));expect(ledger).toMatchObject({total:3,receipts:'120.1234',payments:'20.1234',closing:'100.0000',rows:[{type:'ACCOUNT_OPENING'}]});
  expect(await treasury.ledger(org,source.id,{...query,offset:1})).toMatchObject({rows:[{amount:'20.1234',balance:'120.1234'}]});
  expect(await treasury.ledger(org,source.id,{...query,offset:3})).toMatchObject({total:3,rows:[]});expect(await treasury.ledger(other,source.id,query)).toBeNull();
});

it('rejects overpayments, unavailable parties, wrong invoice owners, duplicate allocations and insufficient supplier funds',async()=>{
  const source=await account('0'),sold=await sale();await purchase();const input=settlement('customers',source.id);
  await expect(treasury.settle(org,user,randomUUID(),{...input,amount:'101'})).rejects.toMatchObject({reason:'AMOUNT_EXCEEDS_DEBT'});
  await expect(treasury.settle(org,user,randomUUID(),{...input,partyId:randomUUID()})).rejects.toMatchObject({reason:'PARTY_UNAVAILABLE'});
  for(const allocations of [[{documentId:randomUUID(),amount:'1'}],[{documentId:sold.id,amount:'21'}],[{documentId:sold.id,amount:'1'},{documentId:sold.id,amount:'1'}]])await expect(treasury.settle(org,user,randomUUID(),{...input,allocations})).rejects.toMatchObject({reason:'INVALID_ALLOCATION'});
  await expect(treasury.settle(org,user,randomUUID(),settlement('suppliers',source.id))).rejects.toMatchObject({reason:'INSUFFICIENT_FUNDS'});
  await db.customer.update({where:{id:customer},data:{active:false}});await expect(treasury.settle(org,user,randomUUID(),input)).rejects.toMatchObject({reason:'PARTY_UNAVAILABLE'});
  expect(await db.partySettlement.count({where:{organizationId:org}})).toBe(0);
});

it('deducts credited invoice returns before allocating subsequent collections or payments',async()=>{
  const source=await account(),sold=await sale(),bought=await purchase();
  expect(await services.invoiceReturnService.post(org,user,randomUUID(),{saleId:sold.id,lines:[{saleLineId:sold.lines[0]!.id,quantity:'2'}],payments:[{method:'CREDIT',amount:'20'}],reason,occurredAt:now()})).toMatchObject({ok:true});
  expect(await services.purchaseReturnService.post(org,user,randomUUID(),{purchaseId:bought.id,lines:[{purchaseLineId:bought.lines[0]!.id,quantity:'2'}],settlements:[{kind:'SUPPLIER_CREDIT',amount:'20'}],reason,occurredAt:now()})).toMatchObject({ok:true});
  for(const kind of ['customers','suppliers'] as const){const input=settlement(kind,source.id,'80');expect((await treasury.invoices(org,{kind,partyId:input.partyId})).invoices[0]!.balance).toBe('80.0000');expect(await treasury.settle(org,user,randomUUID(),{...input,allocations:[{documentId:kind==='customers'?sold.id:bought.id,amount:'80'}]})).toHaveProperty('amount','80.0000');expect((await treasury.invoices(org,{kind,partyId:input.partyId})).invoices).toEqual([]);}
});

it('prevents concurrent account overspending and concurrent customer overcollection',async()=>{
  const source=await account('10'),destination=await account('0');await sale();
  const moves=await Promise.allSettled([1,2].map(()=>treasury.transfer(org,user,randomUUID(),{fromAccountId:source.id,toAccountId:destination.id,amount:'7',reason})));
  expect(moves.filter(row=>row.status==='fulfilled')).toHaveLength(1);expect((await balances())[source.id]).toBe('3.0000');
  const payments=await Promise.allSettled([1,2].map(()=>treasury.settle(org,user,randomUUID(),settlement('customers',source.id,'70'))));
  expect(payments.filter(row=>row.status==='fulfilled')).toHaveLength(1);expect((await treasury.parties(org,{kind:'customers',search:''})).parties[0]!.balance).toBe('30.0000');
});

it('rechecks active finance authorization and rolls back every financial write if auditing fails',async()=>{
  const source=await account(),destination=await account('0');await sale();
  await expect(treasury.createAccount(org,randomUUID(),randomUUID(),{name:'Unauthorized',paymentMethod:'CASH',openingBalance:'0',reason})).rejects.toMatchObject({reason:'ACTOR_UNAVAILABLE'});
  const cashier=await db.user.create({data:{organizationId:org,name:'Cashier',email:'cashier@example.test',passwordHash:'unused',role:'CASHIER'}});await expect(treasury.transfer(org,cashier.id,randomUUID(),{fromAccountId:source.id,toAccountId:destination.id,amount:'1',reason})).rejects.toMatchObject({reason:'ACTOR_UNAVAILABLE'});
  const broken=new Proxy(db,{get(target,key){if(key==='$transaction')return(work:(tx:unknown)=>Promise<unknown>,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(t,k){if(k==='auditEvent')return{create:async()=>{throw Error('Audit unavailable');}};return Reflect.get(t,k);}})),options as never);return Reflect.get(target,key);}});
  await expect(createTreasuryService(broken).settle(org,user,randomUUID(),settlement('customers',source.id))).rejects.toThrow('Audit unavailable');expect(await db.partySettlement.count({where:{organizationId:org}})).toBe(0);expect((await balances())[source.id]).toBe('100.1234');
});

it('enforces account method and tenant references at the database boundary',async()=>{
  const source=await account('0','CASH'),card=await account('0','CARD');
  const foreignUser=(await db.user.create({data:{organizationId:other,name:'Foreign finance',email:'foreign@example.test',passwordHash:'unused',role:'FINANCE'}})).id;
  const foreign=await treasury.createAccount(other,foreignUser,randomUUID(),{name:'Foreign cash',paymentMethod:'CASH',openingBalance:'0',reason});
  await expect(treasury.transfer(org,user,randomUUID(),{fromAccountId:source.id,toAccountId:foreign.id,amount:'1',reason})).rejects.toMatchObject({reason:'ACCOUNT_UNAVAILABLE'});
  const entry={organizationId:org,actorUserId:user,type:'SALE_RECEIPT' as const,paymentMethod:'CASH' as const,amount:'1',sourceType:'Fixture',sourceId:randomUUID(),occurredAt:now()};
  for(const accountId of [foreign.id,card.id])await expect(db.treasuryTransaction.create({data:{...entry,accountId}})).rejects.toThrow();
  await expect(db.treasuryTransaction.create({data:{...entry,paymentMethod:'CREDIT'}})).rejects.toThrow();
  await expect(db.partySettlement.create({data:{organizationId:org,actorUserId:foreignUser,kind:'customers',customerId:customer,accountId:source.id,amount:'1',reason,idempotencyKey:randomUUID(),commandHash:'a'.repeat(64),occurredAt:now()}})).rejects.toMatchObject({code:'P2003'});
});

it('replays matching concurrent commands once and includes new cash flows in reports and shift summaries',async()=>{
  const source=await account(),destination=await account('0','CARD');await sale();
  const key=randomUUID(),input={fromAccountId:source.id,toAccountId:destination.id,amount:'10',reason};
  const transfers=await Promise.all([treasury.transfer(org,user,key,input),treasury.transfer(org,user,key,input)]);expect(transfers.filter(row=>row.replayed)).toHaveLength(1);
  const paymentKey=randomUUID(),payment=settlement('customers',source.id,'20');const collections=await Promise.all([treasury.settle(org,user,paymentKey,payment),treasury.settle(org,user,paymentKey,payment)]);expect(collections.filter(row=>row.replayed)).toHaveLength(1);
  expect(await db.partySettlement.count({where:{organizationId:org}})).toBe(1);
  const query={kind:'treasury' as const,from:new Date(Date.now()-86400000),to:new Date(),limit:100,offset:0};
  expect(await services.reportsService.read(org,query)).toMatchObject({totalAmount:'120.1234'});
  expect(await services.shiftTotalsService.summarize(org,query.from,query.to,user)).toMatchObject({ok:true,totals:{net:'120.1234',methods:expect.arrayContaining([{method:'CASH',receipts:'120.1234',refunds:'10.0000',net:'110.1234'}])}});
  const ledger=await treasury.ledger(org,source.id,{...query,from:transfers[0]!.occurredAt});expect(ledger).toMatchObject({opening:'100.1234',payments:'10.0000',receipts:'20.0000',closing:'110.1234'});
});

it('forces overlapping balance reads and serializes conflicting withdrawals',async()=>{
  const source=await account('10'),destination=await account('0');let reads=0,release!:()=>void;const gate=new Promise<void>(done=>{release=done;});
  const client=new Proxy(db,{get(target,key){if(key==='$transaction')return(work:(tx:unknown)=>Promise<unknown>,options:unknown)=>target.$transaction(tx=>work(new Proxy(tx,{get(t,k){if(k==='$queryRaw')return async(query:{sql:string})=>{const result=await t.$queryRaw(query as never);if(query.sql.includes('WITH cash_movements AS')&&reads<2){if(++reads===2)release();await gate;}return result;};return Reflect.get(t,k);}})),options as never);return Reflect.get(target,key);}});
  const concurrent=createTreasuryService(client),input={fromAccountId:source.id,toAccountId:destination.id,amount:'7',reason};
  const results=await Promise.allSettled([concurrent.transfer(org,user,randomUUID(),input),concurrent.transfer(org,user,randomUUID(),input)]);expect(reads).toBe(2);expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1);expect((await balances())[source.id]).toBe('3.0000');
},30000);

it('protects current and future balances when later-dated withdrawals already exist',async()=>{
  await purchase();
  for(const kind of ['transfer','supplier'] as const){
    const source=await account('10'),destination=await account('0');
    await db.treasuryTransaction.create({data:{organizationId:org,accountId:source.id,actorUserId:user,paymentMethod:'CASH',type:'EXPENSE_PAYMENT',amount:'7',sourceType:'QA',sourceId:randomUUID(),occurredAt:new Date(Date.now()+86400000)}});
    if(kind==='transfer'){
      await expect(treasury.transfer(org,user,randomUUID(),{fromAccountId:source.id,toAccountId:destination.id,amount:'4',reason})).rejects.toMatchObject({reason:'INSUFFICIENT_FUNDS'});
      await treasury.transfer(org,user,randomUUID(),{fromAccountId:source.id,toAccountId:destination.id,amount:'3',reason});
    }else{
      await expect(treasury.settle(org,user,randomUUID(),settlement('suppliers',source.id,'4'))).rejects.toMatchObject({reason:'INSUFFICIENT_FUNDS'});
      await treasury.settle(org,user,randomUUID(),settlement('suppliers',source.id,'3'));
    }
    expect((await balances())[source.id]).toBe('7.0000');
  }
  const empty=await account('0'),target=await account('0');
  await db.treasuryTransaction.create({data:{organizationId:org,accountId:empty.id,actorUserId:user,paymentMethod:'CASH',type:'ACCOUNT_OPENING',amount:'10',sourceType:'QA',sourceId:randomUUID(),occurredAt:new Date(Date.now()+86400000)}});
  await expect(treasury.transfer(org,user,randomUUID(),{fromAccountId:empty.id,toAccountId:target.id,amount:'1',reason})).rejects.toMatchObject({reason:'INSUFFICIENT_FUNDS'});
});

it('maintains names/defaults and archives only empty accounts with a valid replacement',async()=>{
 const a=await account('0'),b=await account('0');
 await treasury.updateAccount(org,user,a.id,{version:1,makeDefault:true,reason});
 await expect(treasury.updateAccount(org,user,a.id,{version:1,name:'Stale name',reason})).rejects.toThrow('ACCOUNT_CHANGED');
 await expect(treasury.updateAccount(org,user,a.id,{version:2,active:false,reason})).rejects.toThrow('DEFAULT_REPLACEMENT_REQUIRED');
 await treasury.updateAccount(org,user,a.id,{version:2,name:'Archived empty cash',active:false,replacementAccountId:b.id,reason});
 expect(await db.treasuryAccount.findUnique({where:{id:b.id}})).toMatchObject({isDefault:true,active:true});
 expect(await db.treasuryAccount.findUnique({where:{id:a.id}})).toMatchObject({active:false,name:'Archived empty cash'});
 const funded=await account('5');await expect(treasury.updateAccount(org,user,funded.id,{version:1,active:false,reason})).rejects.toThrow('ACCOUNT_NOT_EMPTY');
 expect(await db.treasuryTransaction.count({where:{organizationId:org}})).toBe(1);
});
it('posts explicit sale/expense accounts atomically and rejects foreign, archived or mismatched selections',async()=>{
 const cash=await account('0'),card=await account('0','CARD');
 const input={customerId:customer,warehouseId:warehouse,lines:[{productId:product,quantity:'1',unitPrice:'10',discount:'0'}],payments:[{method:'CASH' as const,amount:'10',accountId:cash.id}],occurredAt:now()};
 const result=await services.salesService.post(org,user,randomUUID(),input);expect(result.ok).toBe(true);if(!result.ok)throw Error();
 expect(await db.treasuryTransaction.findFirst({where:{sourceId:result.sale.id}})).toMatchObject({accountId:cash.id});
 const before=await db.sale.count({where:{organizationId:org}});
 await expect(services.salesService.post(org,user,randomUUID(),{...input,payments:[{...input.payments[0]!,accountId:card.id}]})).rejects.toThrow('ACCOUNT_UNAVAILABLE');
 expect(await db.sale.count({where:{organizationId:org}})).toBe(before);
 const expense=await services.expenseService.post(org,user,randomUUID(),{category:'Office',description:'Selected account test',amount:'1',paymentMethod:'CASH',accountId:cash.id,occurredAt:now()});
 expect(expense.ok).toBe(true);if(!expense.ok)throw Error();expect(await db.treasuryTransaction.findFirst({where:{sourceId:expense.expense.id}})).toMatchObject({accountId:cash.id});
 await expect(services.expenseService.post(other,user,randomUUID(),{category:'Office',description:'Foreign',amount:'1',paymentMethod:'CASH',accountId:cash.id,occurredAt:now()})).resolves.toMatchObject({ok:false});
});

it('prints immutable purchase snapshots and both settlement kinds with tenant-scoped document settings',async()=>{
 const cash=await account('200'),p=await purchase(),saleRow=await sale();
 await services.categoryService.management.saveSettings(org,user,{name:'Receipt business',phone:'123',address:'Office',receiptHeader:'Custom heading',receiptFooter:'Custom ending',version:1});
 expect(await treasury.documents.settings(org)).toMatchObject({name:'Receipt business',receiptHeader:'Custom heading',receiptFooter:'Custom ending'});
 await db.product.update({where:{id:product},data:{name:'Renamed catalogue item'}});
 const purchaseDocument=await treasury.documents.read(org,'purchase',p.id);expect(purchaseDocument.total).toBe('100.0000');expect(purchaseDocument.rows[0]![0]).toBe('Treasury product');
 for(const [kind,partyId,title] of [['customers',customer,'إيصال تحصيل عميل'],['suppliers',supplier,'إيصال سداد مورد']] as const){const posted=await treasury.settle(org,user,randomUUID(),{kind,partyId,accountId:cash.id,amount:'20',reason,allocations:kind==='customers'?[{documentId:saleRow.id,amount:'10'}]:[]});const doc=await treasury.documents.read(org,'settlement',posted.id);expect(doc).toMatchObject({title,total:'20.0000',rows:kind==='customers'?[[saleRow.id,'10.0000'],['تسوية على الحساب','10.0000']]:[['تسوية على الحساب','20.0000']]});await expect(treasury.documents.read(other,'settlement',posted.id)).rejects.toThrow('DOCUMENT_NOT_FOUND');}
 await expect(treasury.documents.read(other,'purchase',p.id)).rejects.toThrow('DOCUMENT_NOT_FOUND');
});

it('reconciles daily analytics, current exceptions and advanced screen/export filters without posting reads',async()=>{
 const cash=await account('100'),card=await account('0','CARD'),sold=await sale(),bought=await purchase();
 const category=await db.category.create({data:{organizationId:org,name:'Analytics category'}});await db.product.update({where:{id:product},data:{categoryId:category.id}});
 await services.invoiceReturnService.post(org,user,randomUUID(),{saleId:sold.id,lines:[{saleLineId:sold.lines[0]!.id,quantity:'2'}],payments:[{method:'CREDIT',amount:'20'}],reason,occurredAt:now()});
 await services.purchaseReturnService.post(org,user,randomUUID(),{purchaseId:bought.id,lines:[{purchaseLineId:bought.lines[0]!.id,quantity:'2'}],settlements:[{kind:'SUPPLIER_CREDIT',amount:'20'}],reason,occurredAt:now()});
 const period={from:new Date(Date.now()-3*86400000),to:new Date(Date.now()+86400000)},base={...period,limit:100,offset:0};
 const salesQuery={...base,kind:'sales' as const,customerId:customer,productId:product,categoryId:category.id,paymentMethod:'CREDIT' as const};
 const screen=await services.reportsService.read(org,salesQuery),exported=await services.reportsService.read(org,salesQuery,true);expect(screen.totalAmount).toBe('80.0000');expect(exported.rows).toEqual(screen.rows);
 expect((await services.reportsService.read(org,{...salesQuery,minAmount:'0'})).totalAmount).toBe('100.0000');expect((await services.reportsService.read(org,{...salesQuery,maxAmount:'0'})).totalAmount).toBe('-20.0000');
 expect((await services.reportsService.read(org,{...base,kind:'purchases',supplierId:supplier,productId:product,categoryId:category.id,paymentMethod:'CREDIT'})).totalAmount).toBe('80.0000');
 expect((await services.reportsService.read(org,{...base,kind:'inventory',productId:product,categoryId:category.id,minQuantity:'1',maxQuantity:'999',search:'TREASURY'})).total).toBe(1);
 await services.salesService.post(org,user,randomUUID(),{customerId:customer,warehouseId:warehouse,lines:[{productId:product,quantity:'1',unitPrice:'10',discount:'0'}],payments:[{method:'CASH',amount:'10',accountId:cash.id}],occurredAt:now()});
 await services.expenseService.post(org,user,randomUUID(),{category:'Analytics',description:'Cash expense',amount:'10',paymentMethod:'CASH',accountId:cash.id,occurredAt:now()});
 await services.expenseService.post(org,user,randomUUID(),{category:'Analytics',description:'Card exception',amount:'1',paymentMethod:'CARD',accountId:card.id,occurredAt:now()});
 expect((await services.reportsService.read(org,{...base,kind:'expenses',accountId:cash.id,paymentMethod:'CASH',search:'Cash'})).totalAmount).toBe('10.0000');
 expect((await services.reportsService.read(org,{...base,kind:'treasury',accountId:card.id,paymentMethod:'CARD',direction:'OUT'})).totalAmount).toBe('-1.0000');
 await db.customer.update({where:{id:customer},data:{creditLimit:'1'}});
 await db.salesReturn.create({data:{organizationId:org,customerId:customer,warehouseId:warehouse,actorUserId:user,reason:'Pending review',total:'1',status:'PENDING_APPROVAL',occurredAt:now()}});
 await db.inventoryTransaction.create({data:{organizationId:org,warehouseId:warehouse,productId:product,type:'ADJUSTMENT',quantity:'-200',referenceType:'Legacy exception fixture',referenceId:randomUUID(),occurredAt:now()}});
 await createSaleDraftService(db,()=>new Date('2026-01-01')).create(org,user,randomUUID(),{kind:'QUOTATION',customerId:customer,warehouseId:warehouse,lines:[{productId:product,quantity:'1',unitPrice:'10',discount:'0'}]});
 const before=await db.treasuryTransaction.count({where:{organizationId:org}}),analytics=await services.reportsService.analytics(org,period);
 const sum=(field:'sales'|'net')=>analytics.points.reduce((total,p)=>total+BigInt(p[field].replace('.','')),0n);expect(sum('sales')).toBe(900000n);expect(sum('net')).toBe(-10000n);
 expect(analytics.exceptions).toEqual({negativeStock:1,expiredQuotations:1,pendingReturns:1,overCreditLimit:1,negativeAccounts:1});
 await db.customer.update({where:{id:customer},data:{creditLimit:'0'}});expect((await services.reportsService.analytics(org,period)).exceptions.overCreditLimit).toBe(0);
 expect(await db.treasuryTransaction.count({where:{organizationId:org}})).toBe(before);
 expect((await services.reportsService.choices(org)).products.some(p=>p.id===product)).toBe(true);
 await branchContext.run({warehouseIds:[]},async()=>{await expect(services.reportsService.analytics(org,period)).rejects.toThrow('BRANCH_FORBIDDEN');expect((await services.reportsService.choices(org)).accounts).toEqual([]);});
 expect((await services.reportsService.analytics(other,period)).points.every(p=>p.sales==='0.0000'&&p.net==='0.0000')).toBe(true);
});

it('reverses original accounts after a default change without duplicate replacement posting',async()=>{
 const a=await account('100'),b=await account('100');
 const input={supplierId:supplier,warehouseId:warehouse,lines:[{productId:product,quantity:'2',unitCost:'10'}],payments:[{method:'CASH' as const,amount:'20',accountId:a.id}],occurredAt:now()};
 const bought=await services.purchaseService.post(org,user,randomUUID(),input);if(!bought.ok)throw Error(bought.reason);
 const sold=await sale();const refundInput={saleId:sold.id,lines:[{saleLineId:sold.lines[0]!.id,quantity:'1'}],payments:[{method:'CASH' as const,amount:'10',accountId:a.id}],reason,occurredAt:now()};
 const refund=await services.invoiceReturnService.post(org,user,randomUUID(),refundInput);if(!refund.ok)throw Error(refund.reason);
 await treasury.updateAccount(org,user,b.id,{version:1,makeDefault:true,reason});
 const purchaseKey=randomUUID(),returnKey=randomUUID(),replacement={...input,payments:[{method:'CASH' as const,amount:'20',accountId:b.id}]},refundReplacement={...refundInput,payments:[{method:'CASH' as const,amount:'10',accountId:b.id}]};
 expect(await services.purchaseRevisionService.revise(org,user,bought.purchase.id,purchaseKey,replacement)).toMatchObject({ok:true});
 expect(await services.returnRevisionService.revise(org,user,refund.salesReturn.id,returnKey,refundReplacement)).toMatchObject({ok:true});
 const count=await db.treasuryTransaction.count({where:{organizationId:org}});
 expect(await services.purchaseRevisionService.revise(org,user,bought.purchase.id,purchaseKey,replacement)).toMatchObject({ok:true,replayed:true});
 expect(await services.returnRevisionService.revise(org,user,refund.salesReturn.id,returnKey,refundReplacement)).toMatchObject({ok:true,replayed:true});
 expect(await db.treasuryTransaction.count({where:{organizationId:org}})).toBe(count);
 const reversed=await db.treasuryTransaction.findMany({where:{organizationId:org,type:{in:['PURCHASE_PAYMENT_REVERSAL','RETURN_REFUND_REVERSAL']}}});expect(reversed).toHaveLength(2);expect(reversed.every(row=>row.accountId===a.id)).toBe(true);
 expect(await balances()).toMatchObject({[a.id]:'100.0000',[b.id]:'70.0000'});
});

it('posts an explicit no-invoice refund account only after Finance confirmation and replays once',async()=>{
 await account('100');const target=await account('100'),wrong=await account('0','CARD');
 const before=await db.inventoryTransaction.count({where:{organizationId:org}}),cashBefore=await balances();
 const submitted=await services.noInvoiceReturnService.submit(org,user,randomUUID(),{customerId:customer,warehouseId:warehouse,lines:[{productId:product,quantity:'1',unitPrice:'10'}],payments:[{method:'CASH',amount:'10'}],reason,itemCondition:'Unworn',occurredAt:now()});if(!submitted.ok)throw Error(submitted.reason);
 expect(await balances()).toEqual(cashBefore);expect(await db.inventoryTransaction.count({where:{organizationId:org}})).toBe(before);
 await expect(services.noInvoiceApprovalService.approve(org,user,submitted.salesReturn.id,{CASH:wrong.id})).rejects.toMatchObject({reason:'ACCOUNT_UNAVAILABLE'});
 expect(await balances()).toEqual(cashBefore);
 expect(await services.noInvoiceApprovalService.approve(org,user,submitted.salesReturn.id,{CASH:target.id})).toMatchObject({ok:true});
 expect(await services.noInvoiceApprovalService.approve(org,user,submitted.salesReturn.id,{CASH:wrong.id})).toMatchObject({ok:true});
 const entries=await db.treasuryTransaction.findMany({where:{organizationId:org,type:'RETURN_REFUND'}});expect(entries).toHaveLength(1);expect(entries[0]!.accountId).toBe(target.id);expect((await balances())[target.id]).toBe('90.0000');expect(await db.inventoryTransaction.count({where:{organizationId:org}})).toBe(before+1);
});
