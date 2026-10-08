import { describe, expect, it } from 'vitest';
import { calculateShiftTotals, createShiftTotalsService } from '../../../src/modules/finance/shift-totals.js';

describe('shift totals', () => {
  it('nets immutable receipts and refunds by payment method with exact decimals', () => {
    expect(calculateShiftTotals([
      { type: 'SALE_RECEIPT', paymentMethod: 'CASH', amount: '100.1250' },
      { type: 'RETURN_REFUND', paymentMethod: 'CASH', amount: '30.2500' },
      { type: 'SALE_RECEIPT', paymentMethod: 'CARD', amount: '44.0000' },
      { type: 'RETURN_REFUND', paymentMethod: 'WALLET', amount: '3.0000' }
    ])).toEqual({ receipts: '144.1250', refunds: '33.2500', net: '110.8750', methods: [
      { method: 'CARD', receipts: '44.0000', refunds: '0.0000', net: '44.0000' },
      { method: 'CASH', receipts: '100.1250', refunds: '30.2500', net: '69.8750' },
      { method: 'WALLET', receipts: '0.0000', refunds: '3.0000', net: '-3.0000' }
    ] });
  });

  it('returns zero totals for an empty valid period and rejects an invalid period before querying', async () => {
    let called = false;
    const service = createShiftTotalsService({ listEntries: async () => { called = true; return []; } });
    await expect(service.summarize('organization', new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T01:00:00.000Z'))).resolves.toEqual({ ok: true, totals: { receipts: '0.0000', refunds: '0.0000', net: '0.0000', methods: [] } });
    await expect(service.summarize('organization', new Date('2026-01-01T01:00:00.000Z'), new Date('2026-01-01T01:00:00.000Z'))).resolves.toEqual({ ok: false, reason: 'INVALID_SHIFT_PERIOD' });
    expect(called).toBe(true);
  });
});
