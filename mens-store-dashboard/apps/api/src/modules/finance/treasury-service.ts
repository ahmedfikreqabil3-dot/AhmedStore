import {createDocumentService} from '../documents/service.js';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { UpdateTreasuryAccount, CreateTreasuryAccount, TreasuryTransferInput, SettlementInput, TreasuryAccount, TreasuryLedger, PartyStatementQuery } from '@ahmed-store/contracts';
import { can } from '../identity/authorization.js';
import { customerDebt, ledgerUnits } from '../parties/customer-ledger.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { assertOpenPostingPeriod } from './posting-period.js';
import { TreasuryError } from './treasury-errors.js';

export const treasuryInflowTypes = ['SALE_RECEIPT','RETURN_REFUND_REVERSAL','PURCHASE_PAYMENT_REVERSAL','PURCHASE_RETURN_REFUND','CUSTOMER_COLLECTION','ACCOUNT_TRANSFER_IN','ACCOUNT_OPENING'] as const;
const signed = Prisma.sql`CASE WHEN t.type::text IN (${Prisma.join(treasuryInflowTypes)}) THEN t.amount ELSE -t.amount END`;
const hash = (input:unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
async function actor(tx:Prisma.TransactionClient,organizationId:string,id:string) {
  const user=await tx.user.findFirst({where:{id,organizationId,active:true},select:{role:true}});
  if(!user||!can(user.role,'treasury:manage'))throw new TreasuryError('ACTOR_UNAVAILABLE');
}
async function balance(tx:Prisma.TransactionClient,organizationId:string,accountId:string,now:Date) {
  const [row]=await tx.$queryRaw<Array<{balance:Prisma.Decimal}>>(Prisma.sql`SELECT COALESCE(SUM(${signed}),0) AS balance FROM "TreasuryTransaction" t WHERE t."organizationId"=${organizationId} AND t."accountId"=${accountId} AND t."occurredAt"<=${now.toISOString()}::timestamp`);
  return row!.balance;
}
async function availableBalance(tx:Prisma.TransactionClient,organizationId:string,accountId:string,at:Date){
  const [row]=await tx.$queryRaw<Array<{balance:Prisma.Decimal}>>(Prisma.sql`
    WITH cash_movements AS (
      SELECT t."occurredAt",${signed} AS amount FROM "TreasuryTransaction" t
      WHERE t."organizationId"=${organizationId} AND t."accountId"=${accountId}
    ), opening AS (
      SELECT COALESCE(SUM(amount) FILTER (WHERE "occurredAt"<=${at.toISOString()}::timestamp),0) AS value FROM cash_movements
    ), future AS (
      SELECT "occurredAt",SUM(amount) AS amount FROM cash_movements WHERE "occurredAt">${at.toISOString()}::timestamp GROUP BY "occurredAt"
    ), projected AS (
      SELECT opening.value+SUM(future.amount) OVER(ORDER BY future."occurredAt") AS value FROM future CROSS JOIN opening
    ) SELECT LEAST(opening.value,COALESCE(MIN(projected.value),opening.value)) AS balance FROM opening LEFT JOIN projected ON TRUE GROUP BY opening.value`);
  return row!.balance;
}
async function availableAccount(tx:Prisma.TransactionClient,organizationId:string,id:string) {
  const account=await tx.treasuryAccount.findFirst({where:{id,organizationId,active:true}});
  if(!account)throw new TreasuryError('ACCOUNT_UNAVAILABLE');return account;
}
function replay(prior:{id:string;amount:Prisma.Decimal;occurredAt:Date;commandHash:string},commandHash:string) {
  if(prior.commandHash!==commandHash)throw new TreasuryError('IDEMPOTENCY_KEY_CONFLICT');
  return {id:prior.id,amount:prior.amount.toFixed(4),occurredAt:prior.occurredAt,replayed:true};
}
type InvoiceQuery={kind:SettlementInput['kind'];partyId:string};
type InvoiceRow={id:string;occurredAt:Date;balance:Prisma.Decimal};
async function invoices(tx:Prisma.TransactionClient,organizationId:string,input:InvoiceQuery,ids?:string[]) {
  const customer=input.kind==='customers';
  const documents=customer ? Prisma.sql`SELECT d.id,d."occurredAt",
    COALESCE((SELECT SUM(p.amount) FROM "SalePayment" p WHERE p."saleId"=d.id AND p.method='CREDIT'),0)
    -COALESCE((SELECT SUM(p.amount) FROM "ReturnPayment" p JOIN "SalesReturn" r ON r.id=p."salesReturnId" WHERE r."organizationId"=${organizationId} AND r."saleId"=d.id AND r.status='POSTED' AND p.method='CREDIT'),0)
    -COALESCE((SELECT SUM(a.amount) FROM "SettlementAllocation" a WHERE a."organizationId"=${organizationId} AND a."saleId"=d.id),0) AS balance
    FROM "Sale" d WHERE d."organizationId"=${organizationId} AND d."customerId"=${input.partyId} AND d.status='POSTED'`
    : Prisma.sql`SELECT d.id,d."occurredAt",
    COALESCE((SELECT SUM(p.amount) FROM "PurchasePayment" p WHERE p."purchaseId"=d.id AND p.method='CREDIT'),0)
    -COALESCE((SELECT SUM(p.amount) FROM "PurchaseReturnSettlement" p JOIN "PurchaseReturn" r ON r.id=p."purchaseReturnId" WHERE r."organizationId"=${organizationId} AND r."purchaseId"=d.id AND r.status='POSTED' AND p.kind='SUPPLIER_CREDIT'),0)
    -COALESCE((SELECT SUM(a.amount) FROM "SettlementAllocation" a WHERE a."organizationId"=${organizationId} AND a."purchaseId"=d.id),0) AS balance
    FROM "Purchase" d WHERE d."organizationId"=${organizationId} AND d."supplierId"=${input.partyId} AND d.status='POSTED'`;
  return tx.$queryRaw<InvoiceRow[]>(Prisma.sql`WITH documents AS (${documents}) SELECT * FROM documents WHERE balance>0 ${ids?Prisma.sql`AND id IN (${Prisma.join(ids)})`:Prisma.empty} ORDER BY "occurredAt",id LIMIT ${ids?100:50}`);
}

export function createTreasuryService(prisma:PrismaClient) {
  return {
    documents:createDocumentService(prisma),
    async choices(organizationId:string){return {accounts:await prisma.treasuryAccount.findMany({where:{organizationId,active:true},select:{id:true,name:true,paymentMethod:true,isDefault:true},orderBy:[{paymentMethod:'asc'},{name:'asc'}]})};},
    async updateAccount(organizationId:string,actorUserId:string,id:string,input:UpdateTreasuryAccount){
      try{return await retryWriteConflict(()=>prisma.$transaction(async tx=>{
        await actor(tx,organizationId,actorUserId);
        const current=await tx.treasuryAccount.findFirst({where:{id,organizationId}});if(!current)throw new TreasuryError('ACCOUNT_UNAVAILABLE');
        if(current.version!==input.version)throw new TreasuryError('ACCOUNT_CHANGED');
        if(input.active===false){
          const [funds]=await tx.$queryRaw<Array<{amount:Prisma.Decimal;future:number}>>(Prisma.sql`SELECT COALESCE(SUM(${signed}),0) AS amount,COUNT(*) FILTER(WHERE t."occurredAt">CURRENT_TIMESTAMP)::int AS future FROM "TreasuryTransaction" t WHERE t."organizationId"=${organizationId} AND t."accountId"=${id}`);
          if(!funds!.amount.isZero()||funds!.future)throw new TreasuryError('ACCOUNT_NOT_EMPTY');
        }
        if(input.makeDefault){if(!current.active||input.active===false)throw new TreasuryError('ACCOUNT_UNAVAILABLE');await tx.treasuryAccount.updateMany({where:{organizationId,paymentMethod:current.paymentMethod,isDefault:true,id:{not:id}},data:{isDefault:false,version:{increment:1}}});}
        if(current.isDefault&&input.active===false){
          if(!input.replacementAccountId||input.replacementAccountId===id)throw new TreasuryError('DEFAULT_REPLACEMENT_REQUIRED');
          const replacement=await availableAccount(tx,organizationId,input.replacementAccountId);if(replacement.paymentMethod!==current.paymentMethod)throw new TreasuryError('ACCOUNT_UNAVAILABLE');
          await tx.treasuryAccount.update({where:{id},data:{isDefault:false}});
          await tx.treasuryAccount.update({where:{id:replacement.id},data:{isDefault:true,version:{increment:1}}});
        }
        const updated=await tx.treasuryAccount.update({where:{id},data:{name:input.name,active:input.active,...input.makeDefault?{isDefault:true}:input.active===false?{isDefault:false}:{},version:{increment:1}}});
        await tx.auditEvent.create({data:{organizationId,actorUserId,entityType:'TreasuryAccount',entityId:id,action:'TREASURY_ACCOUNT_UPDATED',details:input}});
        return {id:updated.id,version:updated.version};
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw new TreasuryError('ACCOUNT_NAME_EXISTS');throw e;}
    },
    async accounts(organizationId:string):Promise<{accounts:TreasuryAccount[]}> {
      const now=new Date().toISOString();
      const rows=await prisma.$queryRaw<Array<Omit<TreasuryAccount,'balance'>&{balance:Prisma.Decimal}>>(Prisma.sql`SELECT a.id,a.name,a."paymentMethod",a."isDefault",a.active,a.version,
        COALESCE((SELECT SUM(${signed}) FROM "TreasuryTransaction" t WHERE t."organizationId"=a."organizationId" AND t."accountId"=a.id AND t."occurredAt"<=${now}::timestamp),0) AS balance
        FROM "TreasuryAccount" a WHERE a."organizationId"=${organizationId} ORDER BY a."isDefault" DESC,a.name,a.id`);
      return {accounts:rows.map(row=>({...row,paymentMethod:row.paymentMethod,balance:row.balance.toFixed(4)}))};
    },
    async createAccount(organizationId:string,actorUserId:string,key:string,input:CreateTreasuryAccount) {
      const commandHash=hash(input),occurredAt=new Date();
      return retryWriteConflict(()=>prisma.$transaction(async tx=>{
        await actor(tx,organizationId,actorUserId);
        const prior=await tx.treasuryAccount.findUnique({where:{organizationId_createKey:{organizationId,createKey:key}}});
        if(prior){if(prior.commandHash!==commandHash)throw new TreasuryError('IDEMPOTENCY_KEY_CONFLICT');return{id:prior.id,amount:new Prisma.Decimal(input.openingBalance).toFixed(4),occurredAt:prior.createdAt,replayed:true};}
        if(await tx.treasuryAccount.findUnique({where:{organizationId_name:{organizationId,name:input.name}}}))throw new TreasuryError('ACCOUNT_NAME_EXISTS');
        await assertOpenPostingPeriod(tx,organizationId,actorUserId,occurredAt);
        const account=await tx.treasuryAccount.create({data:{organizationId,name:input.name,paymentMethod:input.paymentMethod,createKey:key,commandHash,createdAt:occurredAt}});
        if(ledgerUnits(input.openingBalance)>0n)await tx.treasuryTransaction.create({data:{organizationId,accountId:account.id,type:'ACCOUNT_OPENING',paymentMethod:input.paymentMethod,amount:input.openingBalance,sourceType:'TreasuryAccount',sourceId:account.id,actorUserId,occurredAt}});
        await tx.auditEvent.create({data:{organizationId,actorUserId,action:'TREASURY_ACCOUNT_CREATED',entityType:'TreasuryAccount',entityId:account.id,details:{reason:input.reason,openingBalance:input.openingBalance,paymentMethod:input.paymentMethod}}});
        return{id:account.id,amount:new Prisma.Decimal(input.openingBalance).toFixed(4),occurredAt,replayed:false};
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
    },
    async transfer(organizationId:string,actorUserId:string,key:string,input:TreasuryTransferInput) {
      const commandHash=hash(input),occurredAt=new Date();
      return retryWriteConflict(()=>prisma.$transaction(async tx=>{
        await actor(tx,organizationId,actorUserId);
        const prior=await tx.treasuryTransfer.findUnique({where:{organizationId_idempotencyKey:{organizationId,idempotencyKey:key}}});if(prior)return replay(prior,commandHash);
        await assertOpenPostingPeriod(tx,organizationId,actorUserId,occurredAt);
        const from=await availableAccount(tx,organizationId,input.fromAccountId),to=await availableAccount(tx,organizationId,input.toAccountId);
        if(from.id===to.id)throw new TreasuryError('ACCOUNT_UNAVAILABLE');
        if((await availableBalance(tx,organizationId,from.id,occurredAt)).lessThan(input.amount))throw new TreasuryError('INSUFFICIENT_FUNDS');
        const document=await tx.treasuryTransfer.create({data:{organizationId,actorUserId,idempotencyKey:key,commandHash,...input,occurredAt}});
        for(const [account,type] of [[from,'ACCOUNT_TRANSFER_OUT'],[to,'ACCOUNT_TRANSFER_IN']] as const)await tx.treasuryTransaction.create({data:{organizationId,actorUserId,accountId:account.id,paymentMethod:account.paymentMethod,type,amount:input.amount,sourceType:'TreasuryTransfer',sourceId:document.id,occurredAt}});
        await tx.auditEvent.create({data:{organizationId,actorUserId,action:'TREASURY_TRANSFER_POSTED',entityType:'TreasuryTransfer',entityId:document.id,details:{reason:input.reason,fromAccountId:from.id,toAccountId:to.id,amount:input.amount}}});
        return{id:document.id,amount:document.amount.toFixed(4),occurredAt,replayed:false};
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
    },
    async parties(organizationId:string,input:{kind:SettlementInput['kind'];search:string}) {
      const source=input.kind==='customers'?Prisma.sql`SELECT p.id,p.name,COALESCE((SELECT SUM(l.amount) FROM "CustomerLedgerEntry" l WHERE l."organizationId"=p."organizationId" AND l."customerId"=p.id),0) AS balance FROM "Customer" p`
        :Prisma.sql`SELECT p.id,p.name,COALESCE((SELECT SUM(CASE WHEN l.type='PURCHASE_CREDIT' THEN l.amount ELSE -l.amount END) FROM "SupplierLedgerEntry" l WHERE l."organizationId"=p."organizationId" AND l."supplierId"=p.id),0) AS balance FROM "Supplier" p`;
      const rows=await prisma.$queryRaw<Array<{id:string;name:string;balance:Prisma.Decimal}>>(Prisma.sql`${source} WHERE p."organizationId"=${organizationId} AND p.active AND p.name ILIKE ${'%'+input.search+'%'} ORDER BY p.name,p.id LIMIT 25`);
      return{parties:rows.map(row=>({...row,balance:row.balance.toFixed(4)}))};
    },
    async invoices(organizationId:string,input:InvoiceQuery) {
      const rows=await prisma.$transaction(tx=>invoices(tx,organizationId,input),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
      return{invoices:rows.map(row=>({...row,balance:row.balance.toFixed(4)}))};
    },
    async settle(organizationId:string,actorUserId:string,key:string,input:SettlementInput) {
      const commandHash=hash(input),occurredAt=new Date();
      return retryWriteConflict(()=>prisma.$transaction(async tx=>{
        await actor(tx,organizationId,actorUserId);
        const prior=await tx.partySettlement.findUnique({where:{organizationId_idempotencyKey:{organizationId,idempotencyKey:key}}});if(prior)return replay(prior,commandHash);
        await assertOpenPostingPeriod(tx,organizationId,actorUserId,occurredAt);
        const account=await availableAccount(tx,organizationId,input.accountId),customer=input.kind==='customers';
        const party=customer?await tx.customer.findFirst({where:{organizationId,id:input.partyId,active:true}}):await tx.supplier.findFirst({where:{organizationId,id:input.partyId,active:true}});
        if(!party)throw new TreasuryError('PARTY_UNAVAILABLE');
        const amount=ledgerUnits(input.amount);
        let debt:bigint;
        if(customer)debt=await customerDebt(tx,organizationId,party.id);
        else{const entries=await tx.supplierLedgerEntry.groupBy({by:['type'],where:{organizationId,supplierId:party.id},_sum:{amount:true}});debt=entries.reduce((sum,row)=>sum+(row.type==='PURCHASE_CREDIT'?1n:-1n)*ledgerUnits(row._sum.amount!.toFixed(4)),0n);}
        if(amount>debt)throw new TreasuryError('AMOUNT_EXCEEDS_DEBT');
        if(!customer&&(await availableBalance(tx,organizationId,account.id,occurredAt)).lessThan(input.amount))throw new TreasuryError('INSUFFICIENT_FUNDS');
        if(input.allocations.length){
          const open=await invoices(tx,organizationId,input,input.allocations.map(row=>row.documentId));
          if(input.allocations.reduce((sum,row)=>sum+ledgerUnits(row.amount),0n)>amount||new Set(input.allocations.map(row=>row.documentId)).size!==input.allocations.length||input.allocations.some(row=>!open.some(doc=>doc.id===row.documentId&&ledgerUnits(doc.balance.toFixed(4))>=ledgerUnits(row.amount))))throw new TreasuryError('INVALID_ALLOCATION');
        }
        const document=await tx.partySettlement.create({data:{organizationId,actorUserId,kind:input.kind,customerId:customer?party.id:null,supplierId:customer?null:party.id,accountId:account.id,amount:input.amount,reason:input.reason,idempotencyKey:key,commandHash,occurredAt}});
        if(customer)await tx.customerLedgerEntry.create({data:{organizationId,customerId:party.id,actorUserId,type:'CUSTOMER_COLLECTION',amount:new Prisma.Decimal(input.amount).negated(),sourceType:'PartySettlement',sourceId:document.id,occurredAt}});
        else await tx.supplierLedgerEntry.create({data:{organizationId,supplierId:party.id,actorUserId,type:'SUPPLIER_PAYMENT',amount:input.amount,sourceType:'PartySettlement',sourceId:document.id,occurredAt}});
        if(input.allocations.length)await tx.settlementAllocation.createMany({data:input.allocations.map(row=>({id:randomUUID(),organizationId,settlementId:document.id,saleId:customer?row.documentId:null,purchaseId:customer?null:row.documentId,amount:row.amount}))});
        await tx.treasuryTransaction.create({data:{organizationId,actorUserId,accountId:account.id,paymentMethod:account.paymentMethod,type:customer?'CUSTOMER_COLLECTION':'SUPPLIER_SETTLEMENT',amount:input.amount,sourceType:'PartySettlement',sourceId:document.id,occurredAt}});
        await tx.auditEvent.create({data:{organizationId,actorUserId,action:customer?'CUSTOMER_COLLECTION_POSTED':'SUPPLIER_PAYMENT_POSTED',entityType:'PartySettlement',entityId:document.id,details:{reason:input.reason,partyId:party.id,accountId:account.id,amount:input.amount,allocations:input.allocations}}});
        return{id:document.id,amount:document.amount.toFixed(4),occurredAt,replayed:false};
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
    },
    async ledger(organizationId:string,accountId:string,query:PartyStatementQuery):Promise<TreasuryLedger|null> {
      return prisma.$transaction(async tx=>{
        const account=await tx.treasuryAccount.findFirst({where:{organizationId,id:accountId}});if(!account)return null;
        const from=query.from.toISOString(),to=query.to.toISOString();
        const source=Prisma.sql`SELECT t.id,t."occurredAt",t.type::text,t."sourceType",t."sourceId",${signed} AS amount FROM "TreasuryTransaction" t WHERE t."organizationId"=${organizationId} AND t."accountId"=${accountId}`;
        const [summary]=await tx.$queryRaw<Array<{opening:Prisma.Decimal;receipts:Prisma.Decimal;payments:Prisma.Decimal;closing:Prisma.Decimal;total:number}>>(Prisma.sql`WITH ledger AS (${source}) SELECT
          COALESCE(SUM(amount) FILTER(WHERE "occurredAt"<${from}::timestamp),0) AS opening,
          COALESCE(SUM(GREATEST(amount,0)) FILTER(WHERE "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp),0) AS receipts,
          COALESCE(SUM(GREATEST(-amount,0)) FILTER(WHERE "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp),0) AS payments,
          COALESCE(SUM(amount) FILTER(WHERE "occurredAt"<=${to}::timestamp),0) AS closing,
          (COUNT(*) FILTER(WHERE "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp))::int AS total FROM ledger`);
        const rows=await tx.$queryRaw<Array<{id:string;occurredAt:Date;type:string;sourceType:string;sourceId:string;amount:Prisma.Decimal;balance:Prisma.Decimal}>>(Prisma.sql`WITH ledger AS (${source}),running AS (SELECT *,SUM(amount) OVER(ORDER BY "occurredAt",id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance FROM ledger WHERE "occurredAt"<=${to}::timestamp) SELECT * FROM running WHERE "occurredAt">=${from}::timestamp ORDER BY "occurredAt",id LIMIT ${query.limit} OFFSET ${query.offset}`);
        return{account:{id:account.id,name:account.name,paymentMethod:account.paymentMethod as TreasuryAccount['paymentMethod'],isDefault:account.isDefault,active:account.active,version:account.version,balance:(await balance(tx,organizationId,accountId,new Date())).toFixed(4)},from:query.from,to:query.to,opening:summary!.opening.toFixed(4),receipts:summary!.receipts.toFixed(4),payments:summary!.payments.toFixed(4),closing:summary!.closing.toFixed(4),total:summary!.total,limit:query.limit,offset:query.offset,rows:rows.map(row=>({...row,amount:row.amount.toFixed(4),balance:row.balance.toFixed(4)}))};
      },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    }
  };
}
