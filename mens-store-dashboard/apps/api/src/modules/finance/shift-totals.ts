import type { PaymentMethod } from '@ahmed-store/contracts';

export type TreasuryEntry = { type: 'SALE_RECEIPT' | 'RETURN_REFUND' | 'RETURN_REFUND_REVERSAL'; paymentMethod: PaymentMethod; amount: string };
export type ShiftMethodTotal = { method: PaymentMethod; receipts: string; refunds: string; net: string };
export type ShiftTotals = { receipts: string; refunds: string; net: string; methods: ShiftMethodTotal[] };

function toUnits(value: string) {
  const [whole, fraction] = value.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction);
}

function fromUnits(units: bigint) {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  return `${negative ? '-' : ''}${absolute / 10_000n}.${(absolute % 10_000n).toString().padStart(4, '0')}`;
}

export function calculateShiftTotals(entries: TreasuryEntry[]): ShiftTotals {
  const byMethod = new Map<PaymentMethod, { receipts: bigint; refunds: bigint }>();
  for (const entry of entries) {
    const current = byMethod.get(entry.paymentMethod) ?? { receipts: 0n, refunds: 0n };
    if (entry.type === 'RETURN_REFUND') current.refunds += toUnits(entry.amount);
    else current.receipts += toUnits(entry.amount);
    byMethod.set(entry.paymentMethod, current);
  }
  const methods = [...byMethod.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([method, totals]) => ({ method, receipts: fromUnits(totals.receipts), refunds: fromUnits(totals.refunds), net: fromUnits(totals.receipts - totals.refunds) }));
  const totals = methods.reduce((current, method) => ({ receipts: current.receipts + toUnits(method.receipts), refunds: current.refunds + toUnits(method.refunds) }), { receipts: 0n, refunds: 0n });
  return { receipts: fromUnits(totals.receipts), refunds: fromUnits(totals.refunds), net: fromUnits(totals.receipts - totals.refunds), methods };
}

export interface ShiftTotalsRepository {
  listEntries(organizationId: string, openedAt: Date, closedAt: Date): Promise<TreasuryEntry[]>;
}

export function createShiftTotalsService(repository: ShiftTotalsRepository) {
  return {
    async summarize(organizationId: string, openedAt: Date, closedAt: Date) {
      if (closedAt <= openedAt) return { ok: false as const, reason: 'INVALID_SHIFT_PERIOD' as const };
      return { ok: true as const, totals: calculateShiftTotals(await repository.listEntries(organizationId, openedAt, closedAt)) };
    }
  };
}
