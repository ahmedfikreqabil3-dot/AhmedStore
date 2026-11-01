import { Prisma, type PrismaClient } from '@prisma/client';
import type { PartyStatement, PartyStatementQuery } from '@ahmed-store/contracts';

type Kind = PartyStatement['kind'];
type Entry = { id: string; occurredAt: Date; type: string; sourceType: string; sourceId: string; amount: Prisma.Decimal; balance: Prisma.Decimal };
type Totals = { opening: Prisma.Decimal; debits: Prisma.Decimal; credits: Prisma.Decimal; closing: Prisma.Decimal; total: number };
export function createPartyStatementService(prisma: PrismaClient) {
  return {
    async read(organizationId: string, kind: Kind, partyId: string, query: PartyStatementQuery): Promise<PartyStatement | null> {
      return prisma.$transaction(async tx => {
        const where = { id: partyId, organizationId };
        const select = { id: true, name: true, active: true };
        const party = kind === 'customers' ? await tx.customer.findFirst({ where, select }) : await tx.supplier.findFirst({ where, select });
        if (!party) return null;
        // Prisma DateTime columns store UTC without a zone; raw Date parameters
        // otherwise compare as timestamptz using the database session's zone.
        const from=query.from.toISOString(),to=query.to.toISOString();
        const ledger = kind === 'customers'
          ? Prisma.sql`SELECT id,"occurredAt",type,"sourceType","sourceId",amount FROM "CustomerLedgerEntry" WHERE "organizationId"=${organizationId} AND "customerId"=${partyId}`
          : Prisma.sql`SELECT id,"occurredAt",type::text,"sourceType","sourceId",CASE WHEN type='PURCHASE_CREDIT' THEN amount ELSE -amount END AS amount FROM "SupplierLedgerEntry" WHERE "organizationId"=${organizationId} AND "supplierId"=${partyId}`;
        const [totals] = await tx.$queryRaw<Totals[]>(Prisma.sql`
          WITH ledger AS (${ledger})
          SELECT COALESCE(SUM(amount) FILTER(WHERE "occurredAt" < ${from}::timestamp),0) AS opening,
            COALESCE(SUM(GREATEST(amount,0)) FILTER(WHERE "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp),0) AS debits,
            COALESCE(SUM(GREATEST(-amount,0)) FILTER(WHERE "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp),0) AS credits,
            COALESCE(SUM(amount) FILTER(WHERE "occurredAt" <= ${to}::timestamp),0) AS closing,
            (COUNT(*) FILTER(WHERE "occurredAt" BETWEEN ${from}::timestamp AND ${to}::timestamp))::int AS total FROM ledger`);
        const rows = await tx.$queryRaw<Entry[]>(Prisma.sql`
          WITH ledger AS (${ledger}), running AS (
            SELECT *,SUM(amount) OVER(ORDER BY "occurredAt",id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
            FROM ledger WHERE "occurredAt" <= ${to}::timestamp
          ) SELECT * FROM running WHERE "occurredAt" >= ${from}::timestamp
          ORDER BY "occurredAt",id LIMIT ${query.limit} OFFSET ${query.offset}`);
        return {
          kind, party, from: query.from, to: query.to, limit: query.limit, offset: query.offset,
          opening: totals!.opening.toFixed(4), debits: totals!.debits.toFixed(4), credits: totals!.credits.toFixed(4), closing: totals!.closing.toFixed(4), total: totals!.total,
          rows: rows.map(row => ({ ...row, amount: row.amount.toFixed(4), balance: row.balance.toFixed(4) }))
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }
  };
}
