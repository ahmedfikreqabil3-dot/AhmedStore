import {branchPredicate,branchContext,BranchAccessError} from '../identity/branch-scope.js';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Analytics, OperationalReport, ReportQuery } from '@ahmed-store/contracts';


function linesFilter(org:string,q:ReportQuery,parent:string,table:string,fk:string){
 if(!q.productId&&!q.categoryId)return Prisma.empty;
 return Prisma.sql`AND EXISTS(SELECT 1 FROM ${Prisma.raw('"'+table+'"')} l JOIN "Product" p ON p.id=l."productId" AND p."organizationId"=${org} WHERE l.${Prisma.raw('"'+fk+'"')}=${Prisma.raw('"'+parent+'".id')} ${q.productId?Prisma.sql`AND l."productId"=${q.productId}`:Prisma.empty} ${q.categoryId?Prisma.sql`AND p."categoryId"=${q.categoryId}`:Prisma.empty})`;
}
function paymentFilter(q:ReportQuery,parent:string,table:string,fk:string,column='method'){
 if(!q.paymentMethod)return Prisma.empty;
 return Prisma.sql`AND EXISTS(SELECT 1 FROM ${Prisma.raw('"'+table+'"')} payment WHERE payment.${Prisma.raw('"'+fk+'"')}=${Prisma.raw('"'+parent+'".id')} AND ${table==='PurchaseReturnSettlement'&&q.paymentMethod==='CREDIT'?Prisma.sql`payment.kind='SUPPLIER_CREDIT'`:Prisma.sql`payment.${Prisma.raw('"'+column+'"')}::text=${q.paymentMethod}`})`;
}
function filtered(dataset:Prisma.Sql,q:ReportQuery){return Prisma.sql`SELECT * FROM (${dataset}) filtered WHERE true
 ${q.search?Prisma.sql`AND (label ILIKE ${'%'+q.search+'%'} OR reference ILIKE ${'%'+q.search+'%'} OR id ILIKE ${'%'+q.search+'%'})`:Prisma.empty}
 ${q.minAmount?Prisma.sql`AND amount>=${q.minAmount}::numeric`:Prisma.empty} ${q.maxAmount?Prisma.sql`AND amount<=${q.maxAmount}::numeric`:Prisma.empty}
 ${q.minQuantity?Prisma.sql`AND quantity>=${q.minQuantity}::numeric`:Prisma.empty} ${q.maxQuantity?Prisma.sql`AND quantity<=${q.maxQuantity}::numeric`:Prisma.empty}
 ${q.direction?Prisma.raw(q.direction==='IN'?'AND amount>0':'AND amount<0'):Prisma.empty}`;}

function source(organizationId: string, q: ReportQuery) {
  if(branchContext.getStore()?.warehouseIds!==undefined&&!['sales','purchases','inventory'].includes(q.kind))throw new BranchAccessError();
  const from = q.from.toISOString(), to = q.to.toISOString();
  const branch = q.warehouseId ? Prisma.sql`AND "warehouseId"=${q.warehouseId}` : Prisma.empty;
  if (q.kind === 'sales') return Prisma.sql`
    SELECT id,"occurredAt","customerId" AS reference,'SALE'::text AS label,total AS amount,NULL::numeric AS quantity
    FROM "Sale" WHERE "organizationId"=${organizationId} ${q.customerId?Prisma.sql`AND "customerId"=${q.customerId}`:Prisma.empty} ${linesFilter(organizationId,q,'Sale','SaleLine','saleId')} ${paymentFilter(q,'Sale','SalePayment','saleId','method')} AND status='POSTED' AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp ${branch} ${branchPredicate()}
    UNION ALL SELECT id,"occurredAt","customerId",'SALES_RETURN',-total,NULL::numeric
    FROM "SalesReturn" WHERE "organizationId"=${organizationId} ${q.customerId?Prisma.sql`AND "customerId"=${q.customerId}`:Prisma.empty} ${linesFilter(organizationId,q,'SalesReturn','ReturnLine','salesReturnId')} ${paymentFilter(q,'SalesReturn','ReturnPayment','salesReturnId','method')} AND status='POSTED' AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp ${branch} ${branchPredicate()}`;
  if (q.kind === 'purchases') return Prisma.sql`
    SELECT id,"occurredAt","supplierId" AS reference,'PURCHASE'::text AS label,total AS amount,NULL::numeric AS quantity
    FROM "Purchase" WHERE "organizationId"=${organizationId} ${q.supplierId?Prisma.sql`AND "supplierId"=${q.supplierId}`:Prisma.empty} ${linesFilter(organizationId,q,'Purchase','PurchaseLine','purchaseId')} ${paymentFilter(q,'Purchase','PurchasePayment','purchaseId','method')} AND status='POSTED' AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp ${branch} ${branchPredicate()}
    UNION ALL SELECT id,"occurredAt","supplierId",'PURCHASE_RETURN',-total,NULL::numeric
    FROM "PurchaseReturn" WHERE "organizationId"=${organizationId} ${q.supplierId?Prisma.sql`AND "supplierId"=${q.supplierId}`:Prisma.empty} ${linesFilter(organizationId,q,'PurchaseReturn','PurchaseReturnLine','purchaseReturnId')} ${paymentFilter(q,'PurchaseReturn','PurchaseReturnSettlement','purchaseReturnId','paymentMethod')} AND status='POSTED' AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp ${branch} ${branchPredicate()}`;
  if (q.kind === 'inventory') return Prisma.sql`
    SELECT p.id,${to}::timestamp AS "occurredAt",p.sku AS reference,p.name AS label,NULL::numeric AS amount,SUM(i.quantity) AS quantity
    FROM "InventoryTransaction" i JOIN "Product" p ON p.id=i."productId" AND p."organizationId"=i."organizationId"
    WHERE i."organizationId"=${organizationId} ${q.productId?Prisma.sql`AND p.id=${q.productId}`:Prisma.empty} ${q.categoryId?Prisma.sql`AND p."categoryId"=${q.categoryId}`:Prisma.empty} AND i."occurredAt"<=${to}::timestamp ${q.warehouseId ? Prisma.sql`AND i."warehouseId"=${q.warehouseId}` : Prisma.empty}
    ${branchPredicate('i."warehouseId"')} GROUP BY p.id,p.sku,p.name HAVING SUM(i.quantity)<>0`;
  if (q.kind === 'expenses') return Prisma.sql`
    SELECT id,"occurredAt",category AS reference,description AS label,amount,NULL::numeric AS quantity
    FROM "Expense" WHERE "organizationId"=${organizationId} ${q.paymentMethod?Prisma.sql`AND "paymentMethod"::text=${q.paymentMethod}`:Prisma.empty} ${q.accountId?Prisma.sql`AND EXISTS(SELECT 1 FROM "TreasuryTransaction" t WHERE t."organizationId"=${organizationId} AND t."sourceType"='Expense' AND t."sourceId"="Expense".id AND t."accountId"=${q.accountId})`:Prisma.empty} AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp`;
  if (q.kind === 'treasury') return Prisma.sql`
    SELECT id,"occurredAt","sourceId" AS reference,type::text||' · '||"paymentMethod"::text AS label,
      CASE WHEN type IN ('SALE_RECEIPT','RETURN_REFUND_REVERSAL','PURCHASE_PAYMENT_REVERSAL','PURCHASE_RETURN_REFUND','CUSTOMER_COLLECTION','ACCOUNT_TRANSFER_IN','ACCOUNT_OPENING') THEN amount ELSE -amount END AS amount,NULL::numeric AS quantity
    FROM "TreasuryTransaction" WHERE "organizationId"=${organizationId} ${q.paymentMethod?Prisma.sql`AND "paymentMethod"::text=${q.paymentMethod}`:Prisma.empty} ${q.accountId?Prisma.sql`AND "accountId"=${q.accountId}`:Prisma.empty} AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp`;
  if (q.kind === 'customers') return Prisma.sql`
    SELECT p.id,${to}::timestamp AS "occurredAt",p.id AS reference,p.name AS label,SUM(l.amount) AS amount,NULL::numeric AS quantity
    FROM "CustomerLedgerEntry" l JOIN "Customer" p ON p.id=l."customerId" AND p."organizationId"=l."organizationId"
    WHERE l."organizationId"=${organizationId} ${q.customerId?Prisma.sql`AND p.id=${q.customerId}`:Prisma.empty} AND l."occurredAt"<=${to}::timestamp GROUP BY p.id,p.name HAVING SUM(l.amount)<>0`;
  return Prisma.sql`
    SELECT p.id,${to}::timestamp AS "occurredAt",p.id AS reference,p.name AS label,
      SUM(CASE WHEN l.type='PURCHASE_CREDIT' THEN l.amount ELSE -l.amount END) AS amount,NULL::numeric AS quantity
    FROM "SupplierLedgerEntry" l JOIN "Supplier" p ON p.id=l."supplierId" AND p."organizationId"=l."organizationId"
    WHERE l."organizationId"=${organizationId} ${q.supplierId?Prisma.sql`AND p.id=${q.supplierId}`:Prisma.empty} AND l."occurredAt"<=${to}::timestamp GROUP BY p.id,p.name
    HAVING SUM(CASE WHEN l.type='PURCHASE_CREDIT' THEN l.amount ELSE -l.amount END)<>0`;
}

export function createReportsService(prisma: PrismaClient) {
  return {
    async choices(organizationId:string){const named={select:{id:true,name:true},orderBy:{name:'asc' as const},take:500};const [customers,suppliers,products,categories,accounts]=await Promise.all([prisma.customer.findMany({...named,where:{organizationId,active:true}}),prisma.supplier.findMany({...named,where:{organizationId,active:true}}),prisma.product.findMany({...named,where:{organizationId}}),prisma.category.findMany({...named,where:{organizationId}}),branchContext.getStore()?.warehouseIds!==undefined?Promise.resolve([]):prisma.treasuryAccount.findMany({...named,where:{organizationId}})]);return{customers,suppliers,products,categories,accounts};},
    async analytics(organizationId:string,q:{from:Date;to:Date}):Promise<Analytics>{
      if(branchContext.getStore()?.warehouseIds!==undefined)throw new BranchAccessError();
      return prisma.$transaction(async tx=>{
        const points=await tx.$queryRaw<Array<{date:string;sales:Prisma.Decimal;receipts:Prisma.Decimal;payments:Prisma.Decimal;net:Prisma.Decimal}>>(Prisma.sql`
          WITH days AS (SELECT generate_series(date_trunc('day',${q.from.toISOString()}::timestamp),date_trunc('day',${q.to.toISOString()}::timestamp),'1 day') AS day),
          sales AS(SELECT date_trunc('day',"occurredAt") AS day,total AS amount FROM "Sale" WHERE "organizationId"=${organizationId} AND status='POSTED' AND "occurredAt" BETWEEN ${q.from.toISOString()}::timestamp AND ${q.to.toISOString()}::timestamp
          UNION ALL SELECT date_trunc('day',"occurredAt"),-total FROM "SalesReturn" WHERE "organizationId"=${organizationId} AND status='POSTED' AND "occurredAt" BETWEEN ${q.from.toISOString()}::timestamp AND ${q.to.toISOString()}::timestamp),
          cash AS(SELECT date_trunc('day',"occurredAt") AS day,CASE WHEN type::text IN ('SALE_RECEIPT','RETURN_REFUND_REVERSAL','PURCHASE_PAYMENT_REVERSAL','PURCHASE_RETURN_REFUND','CUSTOMER_COLLECTION') THEN amount ELSE -amount END AS amount FROM "TreasuryTransaction" WHERE "organizationId"=${organizationId} AND type::text NOT IN ('ACCOUNT_TRANSFER_IN','ACCOUNT_TRANSFER_OUT','ACCOUNT_OPENING') AND "occurredAt" BETWEEN ${q.from.toISOString()}::timestamp AND ${q.to.toISOString()}::timestamp)
          SELECT to_char(d.day,'YYYY-MM-DD') AS date,COALESCE((SELECT SUM(s.amount) FROM sales s WHERE s.day=d.day),0) AS sales,COALESCE((SELECT SUM(GREATEST(c.amount,0)) FROM cash c WHERE c.day=d.day),0) AS receipts,COALESCE((SELECT SUM(GREATEST(-c.amount,0)) FROM cash c WHERE c.day=d.day),0) AS payments,COALESCE((SELECT SUM(c.amount) FROM cash c WHERE c.day=d.day),0) AS net FROM days d ORDER BY d.day`);
        const [exceptions]=await tx.$queryRaw<Array<Analytics['exceptions']>>(Prisma.sql`SELECT
          (SELECT COUNT(*)::int FROM (SELECT "productId","warehouseId" FROM "InventoryTransaction" WHERE "organizationId"=${organizationId} AND "occurredAt"<=CURRENT_TIMESTAMP GROUP BY "productId","warehouseId" HAVING SUM(quantity)<0) n) AS "negativeStock",
          (SELECT COUNT(*)::int FROM "SaleDraft" WHERE "organizationId"=${organizationId} AND kind='QUOTATION' AND status='OPEN' AND "createdAt"<=CURRENT_TIMESTAMP-interval '30 days') AS "expiredQuotations",
          (SELECT COUNT(*)::int FROM "SalesReturn" WHERE "organizationId"=${organizationId} AND status='PENDING_APPROVAL') AS "pendingReturns",
          (SELECT COUNT(*)::int FROM "Customer" c WHERE c."organizationId"=${organizationId} AND c."creditLimit">0 AND COALESCE((SELECT SUM(l.amount) FROM "CustomerLedgerEntry" l WHERE l."organizationId"=${organizationId} AND l."customerId"=c.id),0)>c."creditLimit") AS "overCreditLimit",
          (SELECT COUNT(*)::int FROM (SELECT "accountId" FROM "TreasuryTransaction" WHERE "organizationId"=${organizationId} AND "occurredAt"<=CURRENT_TIMESTAMP GROUP BY "accountId" HAVING SUM(CASE WHEN type::text IN ('SALE_RECEIPT','RETURN_REFUND_REVERSAL','PURCHASE_PAYMENT_REVERSAL','PURCHASE_RETURN_REFUND','CUSTOMER_COLLECTION','ACCOUNT_TRANSFER_IN','ACCOUNT_OPENING') THEN amount ELSE -amount END)<0) n) AS "negativeAccounts"`);
        return {from:q.from,to:q.to,points:points.map(p=>({...p,sales:p.sales.toFixed(4),receipts:p.receipts.toFixed(4),payments:p.payments.toFixed(4),net:p.net.toFixed(4)})),exceptions:exceptions!};
      },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:15000});
    },
    async read(organizationId: string, query: ReportQuery, exportAll = false): Promise<OperationalReport> {
      return prisma.$transaction(async tx => {
        const dataset = filtered(source(organizationId, query),query);
        const [summary] = await tx.$queryRaw<Array<{ total: number; amount: Prisma.Decimal; quantity: Prisma.Decimal }>>(Prisma.sql`
          WITH dataset AS (${dataset}) SELECT COUNT(*)::int AS total,COALESCE(SUM(amount),0) AS amount,COALESCE(SUM(quantity),0) AS quantity FROM dataset`);
        if (exportAll && summary!.total > 10000) throw new Error('REPORT_EXPORT_TOO_LARGE');
        const limit = exportAll ? 10000 : query.limit, offset = exportAll ? 0 : query.offset;
        const rows = await tx.$queryRaw<Array<{ id: string; occurredAt: Date; label: string; reference: string; amount: Prisma.Decimal | null; quantity: Prisma.Decimal | null }>>(Prisma.sql`
          WITH dataset AS (${dataset}) SELECT * FROM dataset ORDER BY "occurredAt" DESC,id LIMIT ${limit} OFFSET ${offset}`);
        return { kind: query.kind, from: query.from, to: query.to, total: summary!.total,
          totalAmount: query.kind === 'inventory' ? null : summary!.amount.toFixed(4),
          totalQuantity: query.kind === 'inventory' ? summary!.quantity.toFixed(4) : null,
          limit, offset, rows: rows.map(row => ({ ...row, amount: row.amount?.toFixed(4) ?? null, quantity: row.quantity?.toFixed(4) ?? null })) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:15000 });
    }
  };
}
