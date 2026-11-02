import assert from 'node:assert/strict';
import {Prisma,type PrismaClient} from '@prisma/client';
import {bundleSchema,digest,ids,units,decimal,type Bundle} from './schema.js';
import {retryWriteConflict} from '../../apps/api/src/modules/shared/retry-write-conflict.js';

type Tx=Prisma.TransactionClient;
const kind='OPENING_CUTOVER';
export async function reconcileBundle(tx:Tx,b:Bundle){
  const id=ids(b),organizationId=id('organization'),where={organizationId};
  const expectedCounts={categories:b.categories.length,warehouses:b.warehouses.length,products:b.products.length,customers:b.customers.length,suppliers:b.suppliers.length,treasuryAccounts:b.treasuryAccounts.length};
  const actualCounts={categories:await tx.category.count({where}),warehouses:await tx.warehouse.count({where}),products:await tx.product.count({where}),customers:await tx.customer.count({where}),suppliers:await tx.supplier.count({where}),treasuryAccounts:await tx.treasuryAccount.count({where})};
  assert.deepEqual(actualCounts,expectedCounts,'MASTER_COUNT_RECONCILIATION_FAILED');
  const stock=await tx.inventoryTransaction.groupBy({by:['warehouseId','productId'],where,_sum:{quantity:true}});
  const customer=await tx.customerLedgerEntry.groupBy({by:['customerId'],where,_sum:{amount:true}});
  const supplier=await tx.supplierLedgerEntry.groupBy({by:['supplierId','type'],where,_sum:{amount:true}});
  const treasury=await tx.treasuryTransaction.groupBy({by:['accountId','type'],where,_sum:{amount:true}});
  const check=(label:string,expected:Map<string,bigint>,actual:Map<string,bigint>)=>{const normalized=(m:Map<string,bigint>)=>[...m].filter(([,v])=>v!==0n).map(([k,v])=>[k,decimal(v)]).sort(([a],[c])=>a!.localeCompare(c!));assert.deepEqual(normalized(actual),normalized(expected),label+'_RECONCILIATION_FAILED');return{matched:true,balances:[...expected].map(([key,value])=>({key,amount:decimal(value)}))};};
  const stockExpected=new Map(b.opening.stock.map(s=>[id('warehouse',s.warehouseKey)+':'+id('product',s.productKey),units(s.quantity)])),stockActual=new Map(stock.map(s=>[s.warehouseId+':'+s.productId,units(s._sum.quantity!.toFixed(4))]));
  const customerExpected=new Map(b.customers.map(c=>[id('customer',c.key),units(b.opening.customers.find(x=>x.customerKey===c.key)?.amount??'0')])),customerActual=new Map(customer.map(c=>[c.customerId,units(c._sum.amount!.toFixed(4))]));
  const supplierExpected=new Map(b.suppliers.map(c=>[id('supplier',c.key),units(b.opening.suppliers.find(x=>x.supplierKey===c.key)?.amount??'0')])),supplierActual=new Map<string,bigint>();for(const s of supplier)supplierActual.set(s.supplierId,(supplierActual.get(s.supplierId)??0n)+(s.type==='PURCHASE_CREDIT'?1n:-1n)*units(s._sum.amount!.toFixed(4)));
  const treasuryExpected=new Map(b.treasuryAccounts.map(a=>[id('account',a.key),units(b.opening.treasury.find(x=>x.accountKey===a.key)?.amount??'0')])),treasuryActual=new Map<string,bigint>();const incoming=new Set(['SALE_RECEIPT','RETURN_REFUND_REVERSAL','PURCHASE_PAYMENT_REVERSAL','PURCHASE_RETURN_REFUND','CUSTOMER_COLLECTION','ACCOUNT_TRANSFER_IN','ACCOUNT_OPENING']);for(const t of treasury){assert(t.accountId,'MISSING_ACCOUNT_LINK');treasuryActual.set(t.accountId,(treasuryActual.get(t.accountId)??0n)+(incoming.has(t.type)?1n:-1n)*units(t._sum.amount!.toFixed(4)));}
  const report={organizationId,sourceHash:digest(b),masterCounts:actualCounts,stock:check('STOCK',stockExpected,stockActual),treasury:check('TREASURY',treasuryExpected,treasuryActual),customers:check('CUSTOMERS',customerExpected,customerActual),suppliers:check('SUPPLIERS',supplierExpected,supplierActual)};
  const org=await tx.organization.findUniqueOrThrow({where:{id:organizationId}});assert.equal(org.name,b.organization.name,'ORGANIZATION_RECONCILIATION_FAILED');
  const equalRows=(label:string,actual:unknown[][],expected:unknown[][])=>{const sort=(rows:unknown[][])=>rows.sort((x,y)=>String(x[0]).localeCompare(String(y[0])));assert.deepEqual(sort(actual),sort(expected),label+'_MASTER_RECONCILIATION_FAILED');};
  const products=await tx.product.findMany({where});equalRows('PRODUCT',products.map(r=>[r.id,r.organizationId,r.name,r.sku,r.barcode,r.categoryId,r.salePrice.toFixed(4),r.costPrice.toFixed(4),r.active]),b.products.map(p=>[id('product',p.key),organizationId,p.name,p.sku,p.barcode,p.categoryKey?id('category',p.categoryKey):null,p.salePrice,p.costPrice,true]));
  const categories=await tx.category.findMany({where});equalRows('CATEGORY',categories.map(r=>[r.id,r.name,r.archivedAt]),b.categories.map(c=>[id('category',c.key),c.name,null]));
  const warehouses=await tx.warehouse.findMany({where});equalRows('WAREHOUSE',warehouses.map(r=>[r.id,r.name,r.active]),b.warehouses.map(w=>[id('warehouse',w.key),w.name,true]));
  const customers=await tx.customer.findMany({where});equalRows('CUSTOMER',customers.map(r=>[r.id,r.name,r.phone,r.email,r.address,r.notes,r.creditLimit.toFixed(4),r.active]),b.customers.map(p=>[id('customer',p.key),p.name,p.phone,p.email,p.address,p.notes,p.creditLimit,true]));
  const suppliers=await tx.supplier.findMany({where});equalRows('SUPPLIER',suppliers.map(r=>[r.id,r.name,r.phone,r.email,r.address,r.notes,r.active]),b.suppliers.map(p=>[id('supplier',p.key),p.name,p.phone,p.email,p.address,p.notes,true]));
  const accounts=await tx.treasuryAccount.findMany({where});equalRows('ACCOUNT',accounts.map(r=>[r.id,r.name,r.paymentMethod,r.isDefault,r.active]),b.treasuryAccounts.map(p=>[id('account',p.key),p.name,p.paymentMethod,p.isDefault,true]));
  const expectedRows=[b.opening.stock.filter(x=>units(x.quantity)!==0n).length,b.opening.treasury.filter(x=>units(x.amount)!==0n).length,b.opening.customers.filter(x=>units(x.amount)!==0n).length,b.opening.suppliers.filter(x=>units(x.amount)!==0n).length];
  assert.deepEqual([await tx.inventoryTransaction.count({where}),await tx.treasuryTransaction.count({where}),await tx.customerLedgerEntry.count({where}),await tx.supplierLedgerEntry.count({where})],expectedRows,'OPENING_ROW_COUNT_FAILED');
  const wrongDate={...where,occurredAt:{not:new Date(b.asOf)}};assert.deepEqual(await Promise.all([tx.inventoryTransaction.count({where:wrongDate}),tx.treasuryTransaction.count({where:wrongDate}),tx.customerLedgerEntry.count({where:wrongDate}),tx.supplierLedgerEntry.count({where:wrongDate})]),[0,0,0,0],'OPENING_DATE_FAILED');
  assert.equal(await tx.sale.count({where}),0,'UNEXPECTED_SALE');assert.equal(await tx.purchase.count({where}),0,'UNEXPECTED_PURCHASE');assert.equal(await tx.salesReturn.count({where}),0,'UNEXPECTED_RETURN');assert.equal(await tx.purchaseReturn.count({where}),0,'UNEXPECTED_PURCHASE_RETURN');
  assert.equal(await tx.dataImport.count({where:{...where,kind}}),1,'IMPORT_AUDIT_MISSING');
  return report;
}
class DryRunRollback extends Error{constructor(readonly report:Awaited<ReturnType<typeof reconcileBundle>> & {replayed:boolean}){super('DRY_RUN_ROLLBACK');}}
export async function importBundle(db:PrismaClient,raw:unknown,options:{email:string;passwordHash:string;dryRun:boolean}){
  const b=bundleSchema.parse(raw),id=ids(b),organizationId=id('organization'),actorUserId=id('actor'),batchId=id('batch',b.batchKey),contentHash=digest(b),asOf=new Date(b.asOf);
  try{return await retryWriteConflict(()=>db.$transaction(async tx=>{
    const [target]=await tx.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;if(!/^ahmed_store_phase5_trial_[a-z0-9_]+$/.test(target.name))throw Error('ISOLATED_PHASE5_DATABASE_REQUIRED');
    await tx.$executeRaw`SET LOCAL statement_timeout='30s'`;await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId},0))::text`;
    const prior=await tx.dataImport.findUnique({where:{organizationId_kind_idempotencyKey:{organizationId,kind,idempotencyKey:b.batchKey}}});
    if(prior){if(prior.contentHash!==contentHash)throw Error('IMPORT_KEY_CONFLICT');const report={...await reconcileBundle(tx,b),replayed:true};if(options.dryRun)throw new DryRunRollback(report);return{...report,dryRun:false};}
    if(await tx.organization.findUnique({where:{id:organizationId}}))throw Error('TARGET_ORGANIZATION_NOT_CLEAN');
    await tx.organization.create({data:{id:organizationId,name:b.organization.name}});
    await tx.user.create({data:{id:actorUserId,organizationId,name:'Migration Administrator',email:options.email.trim().toLowerCase(),passwordHash:options.passwordHash,role:'ADMIN',active:true,allWarehouses:true}});
    if(b.categories.length)await tx.category.createMany({data:b.categories.map(c=>({id:id('category',c.key),organizationId,name:c.name}))});
    if(b.warehouses.length)await tx.warehouse.createMany({data:b.warehouses.map(w=>({id:id('warehouse',w.key),organizationId,name:w.name,active:true}))});
    if(b.products.length)await tx.product.createMany({data:b.products.map(p=>({id:id('product',p.key),organizationId,name:p.name,sku:p.sku,barcode:p.barcode,categoryId:p.categoryKey?id('category',p.categoryKey):null,salePrice:p.salePrice,costPrice:p.costPrice,active:true}))});
    const party=(p:Bundle['suppliers'][number],namespace:string)=>({id:id(namespace,p.key),organizationId,name:p.name,phone:p.phone,email:p.email,address:p.address,notes:p.notes,active:true});
    if(b.customers.length)await tx.customer.createMany({data:b.customers.map(p=>({...party(p,'customer'),creditLimit:p.creditLimit}))});
    if(b.suppliers.length)await tx.supplier.createMany({data:b.suppliers.map(p=>party(p,'supplier'))});
    if(b.treasuryAccounts.length)await tx.treasuryAccount.createMany({data:b.treasuryAccounts.map(a=>({id:id('account',a.key),organizationId,name:a.name,paymentMethod:a.paymentMethod,isDefault:a.isDefault,active:true}))});
    const stock=b.opening.stock.filter(s=>units(s.quantity)!==0n);if(stock.length)await tx.inventoryTransaction.createMany({data:stock.map(s=>({id:id('stock',JSON.stringify([b.batchKey,s.warehouseKey,s.productKey])),organizationId,warehouseId:id('warehouse',s.warehouseKey),productId:id('product',s.productKey),type:'OPENING_BALANCE',quantity:s.quantity,referenceType:kind,referenceId:batchId,idempotencyKey:'migration:'+id('stock',JSON.stringify([b.batchKey,s.warehouseKey,s.productKey])),occurredAt:asOf}))});
    const cash=b.opening.treasury.filter(s=>units(s.amount)!==0n);if(cash.length)await tx.treasuryTransaction.createMany({data:cash.map(s=>({id:id('cash',b.batchKey+':'+s.accountKey),organizationId,accountId:id('account',s.accountKey),type:'ACCOUNT_OPENING',paymentMethod:b.treasuryAccounts.find(a=>a.key===s.accountKey)!.paymentMethod,amount:s.amount,sourceType:'MigrationBatch',sourceId:id('cash',b.batchKey+':'+s.accountKey),actorUserId,occurredAt:asOf}))});
    const customers=b.opening.customers.filter(s=>units(s.amount)!==0n);if(customers.length)await tx.customerLedgerEntry.createMany({data:customers.map(s=>({id:id('customer-opening',s.customerKey),organizationId,customerId:id('customer',s.customerKey),type:'OPENING_BALANCE',amount:s.amount,sourceType:'MigrationBatch',sourceId:id('customer-opening',s.customerKey),actorUserId,occurredAt:asOf}))});
    const suppliers=b.opening.suppliers.filter(s=>units(s.amount)!==0n);if(suppliers.length)await tx.supplierLedgerEntry.createMany({data:suppliers.map(s=>({id:id('supplier-opening',s.supplierKey),organizationId,supplierId:id('supplier',s.supplierKey),type:units(s.amount)>0n?'PURCHASE_CREDIT':'PURCHASE_RETURN_CREDIT',amount:decimal(units(s.amount)>0n?units(s.amount):-units(s.amount)),sourceType:'MigrationBatch',sourceId:batchId,actorUserId,occurredAt:asOf}))});
    await tx.dataImport.create({data:{id:batchId,organizationId,actorUserId,kind,idempotencyKey:b.batchKey,contentHash,importedCount:b.categories.length+b.warehouses.length+b.products.length+b.customers.length+b.suppliers.length+b.treasuryAccounts.length+stock.length+cash.length+customers.length+suppliers.length}});
    await tx.auditEvent.create({data:{organizationId,actorUserId,entityType:'MigrationBatch',entityId:batchId,action:'OPENING_CUTOVER_IMPORTED',details:{sourceSystem:b.sourceSystem,sourceHash:contentHash,asOf:b.asOf}}});
    const report={...await reconcileBundle(tx,b),replayed:false};if(options.dryRun)throw new DryRunRollback(report);return{...report,dryRun:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:15000,timeout:60000}));}catch(e){if(e instanceof DryRunRollback)return{...e.report,dryRun:true};throw e;}
}
