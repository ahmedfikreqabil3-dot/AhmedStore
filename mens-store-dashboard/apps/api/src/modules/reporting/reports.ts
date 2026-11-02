import {branchPredicate,branchContext,BranchAccessError} from '../identity/branch-scope.js';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { OperationalReport, ReportQuery } from '@ahmed-store/contracts';

function source(organizationId: string, q: ReportQuery) {
  if(branchContext.getStore()?.warehouseIds!==undefined&&!['sales','purchases','inventory'].includes(q.kind))throw new BranchAccessError();
  const from = q.from.toISOString(), to = q.to.toISOString();
  const branch = q.warehouseId ? Prisma.sql`AND "warehouseId"=${q.warehouseId}` : Prisma.empty;
  if (q.kind === 'sales') return Prisma.sql`
    SELECT id,"occurredAt","customerId" AS reference,'SALE'::text AS label,total AS amount,NULL::numeric AS quantity
    FROM "Sale" WHERE "organizationId"=${organizationId} AND status='POSTED' AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp ${branch} ${branchPredicate()}
    UNION ALL SELECT id,"occurredAt","customerId",'SALES_RETURN',-total,NULL::numeric
    FROM "SalesReturn" WHERE "organizationId"=${organizationId} AND status='POSTED' AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp ${branch} ${branchPredicate()}`;
  if (q.kind === 'purchases') return Prisma.sql`
    SELECT id,"occurredAt","supplierId" AS reference,'PURCHASE'::text AS label,total AS amount,NULL::numeric AS quantity
    FROM "Purchase" WHERE "organizationId"=${organizationId} AND status='POSTED' AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp ${branch} ${branchPredicate()}
    UNION ALL SELECT id,"occurredAt","supplierId",'PURCHASE_RETURN',-total,NULL::numeric
    FROM "PurchaseReturn" WHERE "organizationId"=${organizationId} AND status='POSTED' AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp ${branch} ${branchPredicate()}`;
  if (q.kind === 'inventory') return Prisma.sql`
    SELECT p.id,${to}::timestamp AS "occurredAt",p.sku AS reference,p.name AS label,NULL::numeric AS amount,SUM(i.quantity) AS quantity
    FROM "InventoryTransaction" i JOIN "Product" p ON p.id=i."productId" AND p."organizationId"=i."organizationId"
    WHERE i."organizationId"=${organizationId} AND i."occurredAt"<=${to}::timestamp ${q.warehouseId ? Prisma.sql`AND i."warehouseId"=${q.warehouseId}` : Prisma.empty}
    ${branchPredicate('i."warehouseId"')} GROUP BY p.id,p.sku,p.name HAVING SUM(i.quantity)<>0`;
  if (q.kind === 'expenses') return Prisma.sql`
    SELECT id,"occurredAt",category AS reference,description AS label,amount,NULL::numeric AS quantity
    FROM "Expense" WHERE "organizationId"=${organizationId} AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp`;
  if (q.kind === 'treasury') return Prisma.sql`
    SELECT id,"occurredAt","sourceId" AS reference,type::text||' · '||"paymentMethod"::text AS label,
      CASE WHEN type IN ('SALE_RECEIPT','RETURN_REFUND_REVERSAL','PURCHASE_PAYMENT_REVERSAL','PURCHASE_RETURN_REFUND','CUSTOMER_COLLECTION','ACCOUNT_TRANSFER_IN','ACCOUNT_OPENING') THEN amount ELSE -amount END AS amount,NULL::numeric AS quantity
    FROM "TreasuryTransaction" WHERE "organizationId"=${organizationId} AND "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp`;
  if (q.kind === 'customers') return Prisma.sql`
    SELECT p.id,${to}::timestamp AS "occurredAt",p.id AS reference,p.name AS label,SUM(l.amount) AS amount,NULL::numeric AS quantity
    FROM "CustomerLedgerEntry" l JOIN "Customer" p ON p.id=l."customerId" AND p."organizationId"=l."organizationId"
    WHERE l."organizationId"=${organizationId} AND l."occurredAt"<=${to}::timestamp GROUP BY p.id,p.name HAVING SUM(l.amount)<>0`;
  return Prisma.sql`
    SELECT p.id,${to}::timestamp AS "occurredAt",p.id AS reference,p.name AS label,
      SUM(CASE WHEN l.type='PURCHASE_CREDIT' THEN l.amount ELSE -l.amount END) AS amount,NULL::numeric AS quantity
    FROM "SupplierLedgerEntry" l JOIN "Supplier" p ON p.id=l."supplierId" AND p."organizationId"=l."organizationId"
    WHERE l."organizationId"=${organizationId} AND l."occurredAt"<=${to}::timestamp GROUP BY p.id,p.name
    HAVING SUM(CASE WHEN l.type='PURCHASE_CREDIT' THEN l.amount ELSE -l.amount END)<>0`;
}

export function createReportsService(prisma: PrismaClient) {
  return {
    async read(organizationId: string, query: ReportQuery, exportAll = false): Promise<OperationalReport> {
      return prisma.$transaction(async tx => {
        const dataset = source(organizationId, query);
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
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }
  };
}
