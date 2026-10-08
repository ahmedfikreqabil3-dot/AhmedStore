import type { ShiftTotals } from './shift-totals.js';

export type ShiftRecord = {
  id: string;
  organizationId: string;
  userId: string;
  status: 'OPEN' | 'CLOSED' | 'REVIEWED';
  openedAt: Date;
  closedAt: Date | null;
  closedByUserId: string | null;
  expectedCash: string | null;
  countedCash: string | null;
  cashDifference: string | null;
  discrepancyReason: string | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
};

export interface ShiftRepository {
  findOpen(organizationId: string, userId: string): Promise<ShiftRecord | null>;
  create(organizationId: string, userId: string, openedAt: Date): Promise<ShiftRecord>;
  findById(organizationId: string, shiftId: string): Promise<ShiftRecord | null>;
  close(organizationId: string, shiftId: string, userId: string, closedAt: Date, reconciliation: ShiftCashReconciliation): Promise<ShiftRecord | null>;
  review(organizationId: string, shiftId: string, reviewerUserId: string, reviewedAt: Date): Promise<ShiftRecord | null>;
  listClosed(organizationId: string): Promise<ShiftRecord[]>;
}

export type ShiftCashReconciliation = { expectedCash: string; countedCash: string; cashDifference: string; discrepancyReason: string | null };

function units(value: string) {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const amount = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
  return negative ? -amount : amount;
}

function amount(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 10_000n}.${(absolute % 10_000n).toString().padStart(4, '0')}`;
}

export function createShiftService(repository: ShiftRepository, summarize: (organizationId: string, openedAt: Date, closedAt: Date) => Promise<{ ok: true; totals: ShiftTotals } | { ok: false; reason: 'INVALID_SHIFT_PERIOD' }>) {
  return {
    async open(organizationId: string, userId: string, openedAt: Date) {
      if (await repository.findOpen(organizationId, userId)) return { ok: false as const, reason: 'SHIFT_ALREADY_OPEN' as const };
      return { ok: true as const, shift: await repository.create(organizationId, userId, openedAt) };
    },
    async current(organizationId: string, userId: string) {
      return repository.findOpen(organizationId, userId);
    },
    async close(organizationId: string, userId: string, shiftId: string, closedAt: Date, countedCash: string, discrepancyReason: string | null) {
      const shift = await repository.findById(organizationId, shiftId);
      if (!shift) return { ok: false as const, reason: 'SHIFT_NOT_FOUND' as const };
      if (shift.userId !== userId) return { ok: false as const, reason: 'SHIFT_NOT_OWNED' as const };
      if (shift.status !== 'OPEN') return { ok: false as const, reason: 'SHIFT_NOT_OPEN' as const };
      const summarized = await summarize(organizationId, shift.openedAt, closedAt);
      if (!summarized.ok) return summarized;
      const expectedCash = summarized.totals.methods.find((method) => method.method === 'CASH')?.net ?? '0.0000';
      const cashDifference = amount(units(countedCash) - units(expectedCash));
      if (cashDifference !== '0.0000' && !discrepancyReason) return { ok: false as const, reason: 'CASH_DISCREPANCY_REASON_REQUIRED' as const };
      const closed = await repository.close(organizationId, shiftId, userId, closedAt, { expectedCash, countedCash, cashDifference, discrepancyReason });
      return closed ? { ok: true as const, shift: closed } : { ok: false as const, reason: 'SHIFT_NOT_OPEN' as const };
    },
    async review(organizationId: string, reviewerUserId: string, shiftId: string, reviewedAt: Date) {
      const shift = await repository.findById(organizationId, shiftId);
      if (!shift) return { ok: false as const, reason: 'SHIFT_NOT_FOUND' as const };
      if (shift.status !== 'CLOSED') return { ok: false as const, reason: 'SHIFT_NOT_CLOSED' as const };
      const reviewed = await repository.review(organizationId, shiftId, reviewerUserId, reviewedAt);
      return reviewed ? { ok: true as const, shift: reviewed } : { ok: false as const, reason: 'SHIFT_NOT_CLOSED' as const };
    },
    async summary(organizationId: string, requesterUserId: string, canReview: boolean, shiftId: string, now: Date) {
      const shift = await repository.findById(organizationId, shiftId);
      if (!shift) return { ok: false as const, reason: 'SHIFT_NOT_FOUND' as const };
      if (shift.userId !== requesterUserId && !canReview) return { ok: false as const, reason: 'FORBIDDEN' as const };
      const closedAt = shift.closedAt ?? now;
      const result = await summarize(organizationId, shift.openedAt, closedAt);
      return result.ok ? { ok: true as const, shift, totals: result.totals } : result;
    },
    listClosed(organizationId: string) { return repository.listClosed(organizationId); }
  };
}
