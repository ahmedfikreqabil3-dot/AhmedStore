import { describe, expect, it } from 'vitest';
import { calculateSale } from '../../../src/modules/sales/calculation.js';

const customerId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const warehouseId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
const productId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';

function sale(overrides: Partial<{ lines: Array<{ productId: string; quantity: string; unitPrice: string; discount: string }>; payments: Array<{ method: 'CASH'; amount: string }> }> = {}) {
  return { customerId, warehouseId, occurredAt: new Date('2026-01-01T00:00:00.000Z'), lines: [{ productId, quantity: '2.0000', unitPrice: '10.0000', discount: '1.0000' }], payments: [{ method: 'CASH' as const, amount: '19.0000' }], ...overrides };
}

describe('sale calculation', () => {
  it('calculates exact line and invoice totals without floating-point arithmetic', () => {
    expect(calculateSale(sale())).toEqual({ ok: true, sale: { subtotal: '20.0000', discount: '1.0000', total: '19.0000', lines: [{ productId, quantity: '2.0000', unitPrice: '10.0000', discount: '1.0000', total: '19.0000' }] } });
  });

  it('rounds half-up at four decimal places and accepts whole-number decimal inputs', () => {
    expect(calculateSale(sale({ lines: [{ productId, quantity: '0.0001', unitPrice: '0.5000', discount: '0.0000' }], payments: [{ method: 'CASH', amount: '0.0001' }] }))).toMatchObject({ ok: true, sale: { total: '0.0001' } });
    expect(calculateSale(sale({ lines: [{ productId, quantity: '1', unitPrice: '1', discount: '0' }], payments: [{ method: 'CASH', amount: '1' }] }))).toMatchObject({ ok: true, sale: { total: '1.0000' } });
  });

  it('rejects a discount larger than its line subtotal', () => {
    expect(calculateSale(sale({ lines: [{ productId, quantity: '1.0000', unitPrice: '10.0000', discount: '10.0001' }] }))).toEqual({ ok: false, reason: 'LINE_DISCOUNT_EXCEEDS_SUBTOTAL' });
  });

  it('rejects payment totals that do not exactly match the invoice total', () => {
    expect(calculateSale(sale({ payments: [{ method: 'CASH', amount: '18.9999' }] }))).toEqual({ ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' });
  });
});
