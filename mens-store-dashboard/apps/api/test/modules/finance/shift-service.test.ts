import { describe, expect, it } from 'vitest';
import { createShiftService, type ShiftRecord } from '../../../src/modules/finance/shift-service.js';

const org = 'org-1';
const user = 'cashier-1';
const openedAt = new Date('2026-10-08T08:00:00.000Z');
const shift = (overrides: Partial<ShiftRecord> = {}): ShiftRecord => ({ id: 'shift-1', organizationId: org, userId: user, status: 'OPEN', openedAt, closedAt: null, closedByUserId: null, reviewedAt: null, reviewedByUserId: null, ...overrides });

describe('shift service', () => {
  it('opens only one shift per user and exposes the current shift', async () => {
    let open: ShiftRecord | null = null;
    const service = createShiftService({
      findOpen: async () => open,
      create: async (_org, _user, when) => (open = shift({ openedAt: when })),
      findById: async () => open,
      close: async () => null,
      review: async () => null,
      listClosed: async () => []
    }, async () => ({ ok: true, totals: { receipts: '0.0000', refunds: '0.0000', net: '0.0000', methods: [] } }));
    expect((await service.open(org, user, openedAt)).ok).toBe(true);
    expect(await service.current(org, user)).toEqual(shift());
    expect(await service.open(org, user, openedAt)).toEqual({ ok: false, reason: 'SHIFT_ALREADY_OPEN' });
  });

  it('allows only the shift owner to close an open shift', async () => {
    const record = shift();
    const service = createShiftService({
      findOpen: async () => record,
      create: async () => record,
      findById: async (_organizationId, shiftId) => shiftId === 'missing' ? null : shiftId === 'foreign' ? { ...record, userId: 'another-cashier' } : record,
      close: async () => shift({ status: 'CLOSED', closedAt: new Date('2026-10-08T16:00:00.000Z'), closedByUserId: user }),
      review: async () => null,
      listClosed: async () => []
    }, async () => ({ ok: true, totals: { receipts: '0.0000', refunds: '0.0000', net: '0.0000', methods: [] } }));
    expect(await service.close(org, 'another-cashier', record.id, new Date())).toEqual({ ok: false, reason: 'SHIFT_NOT_OWNED' });
    expect((await service.close(org, user, record.id, new Date())).ok).toBe(true);
    record.status = 'CLOSED';
    expect(await service.close(org, user, record.id, new Date())).toEqual({ ok: false, reason: 'SHIFT_NOT_OPEN' });
  });

  it('requires a closed shift for finance review and calculates totals through the ledger', async () => {
    let record = shift({ status: 'CLOSED', closedAt: new Date('2026-10-08T16:00:00.000Z'), closedByUserId: user });
    const service = createShiftService({
      findOpen: async () => null,
      create: async () => record,
      findById: async (_organizationId, shiftId) => shiftId === 'missing' ? null : shiftId === 'foreign' ? { ...record, userId: 'another-cashier' } : record,
      close: async () => null,
      review: async (_org, _id, reviewer, when) => (record = { ...record, status: 'REVIEWED', reviewedAt: when, reviewedByUserId: reviewer }),
      listClosed: async () => [record]
    }, async (_org, start, end) => start < end ? ({ ok: true, totals: { receipts: '100.0000', refunds: '20.0000', net: '80.0000', methods: [] } }) : ({ ok: false, reason: 'INVALID_SHIFT_PERIOD' }));
    const summary = await service.summary(org, user, false, record.id, new Date());
    expect(summary.ok && summary.totals).toMatchObject({ net: '80.0000' });
    const reviewed = await service.review(org, 'finance-1', record.id, new Date());
    expect(reviewed.ok && reviewed.shift?.status).toBe('REVIEWED');
    expect(await service.review(org, 'finance-1', record.id, new Date())).toEqual({ ok: false, reason: 'SHIFT_NOT_CLOSED' });
    expect(await service.summary(org, user, false, 'missing', new Date())).toEqual({ ok: false, reason: 'SHIFT_NOT_FOUND' });
    expect(await service.summary(org, user, false, 'foreign', new Date())).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('returns stable errors when a concurrent close or review wins and uses now for an open shift summary', async () => {
    const record = shift();
    const now = new Date('2026-10-08T12:00:00.000Z');
    const service = createShiftService({
      findOpen: async () => null,
      create: async () => record,
      findById: async (_organizationId, id) => id === 'missing' ? null : id === 'closed' ? shift({ status: 'CLOSED', openedAt: now, closedAt: now }) : record,
      close: async () => null,
      review: async () => null,
      listClosed: async () => []
    }, async (_org, start, end) => start === end ? ({ ok: false, reason: 'INVALID_SHIFT_PERIOD' }) : ({ ok: true, totals: { receipts: '0.0000', refunds: '0.0000', net: '0.0000', methods: [] } }));
    expect(await service.close(org, user, 'missing', now)).toEqual({ ok: false, reason: 'SHIFT_NOT_FOUND' });
    expect(await service.close(org, user, record.id, now)).toEqual({ ok: false, reason: 'SHIFT_NOT_OPEN' });
    expect(await service.review(org, user, 'missing', now)).toEqual({ ok: false, reason: 'SHIFT_NOT_FOUND' });
    expect(await service.review(org, user, 'closed', now)).toEqual({ ok: false, reason: 'SHIFT_NOT_CLOSED' });
    expect(await service.summary(org, user, false, record.id, now)).toEqual({ ok: true, shift: record, totals: { receipts: '0.0000', refunds: '0.0000', net: '0.0000', methods: [] } });
    expect(await service.summary(org, user, false, 'closed', now)).toEqual({ ok: false, reason: 'INVALID_SHIFT_PERIOD' });
    expect(await service.listClosed(org)).toEqual([]);
  });
});
