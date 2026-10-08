import type { ShiftTotals } from './shift-totals.js';

export type ShiftRecord = {
  id: string;
  organizationId: string;
  userId: string;
  status: 'OPEN' | 'CLOSED' | 'REVIEWED';
  openedAt: Date;
  closedAt: Date | null;
  closedByUserId: string | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
};

export interface ShiftRepository {
  findOpen(organizationId: string, userId: string): Promise<ShiftRecord | null>;
  create(organizationId: string, userId: string, openedAt: Date): Promise<ShiftRecord>;
  findById(organizationId: string, shiftId: string): Promise<ShiftRecord | null>;
  close(organizationId: string, shiftId: string, userId: string, closedAt: Date): Promise<ShiftRecord | null>;
  review(organizationId: string, shiftId: string, reviewerUserId: string, reviewedAt: Date): Promise<ShiftRecord | null>;
  listClosed(organizationId: string): Promise<ShiftRecord[]>;
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
    async close(organizationId: string, userId: string, shiftId: string, closedAt: Date) {
      const shift = await repository.findById(organizationId, shiftId);
      if (!shift) return { ok: false as const, reason: 'SHIFT_NOT_FOUND' as const };
      if (shift.userId !== userId) return { ok: false as const, reason: 'SHIFT_NOT_OWNED' as const };
      if (shift.status !== 'OPEN') return { ok: false as const, reason: 'SHIFT_NOT_OPEN' as const };
      const closed = await repository.close(organizationId, shiftId, userId, closedAt);
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
