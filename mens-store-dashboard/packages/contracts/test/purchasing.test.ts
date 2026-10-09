import { describe, expect, it } from 'vitest';
import { createPurchaseReturnSchema, createPurchaseSchema } from '../src/purchasing.js';

const supplierId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const warehouseId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const productId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';

describe('purchasing contracts', () => {
  it('accepts a purchase line selected by product id or barcode', () => {
    const base = { supplierId, warehouseId, payments: [{ method: 'CASH', amount: '10.0000' }], occurredAt: '2026-01-01T00:00:00.000Z' };
    expect(createPurchaseSchema.parse({ ...base, lines: [{ productId, quantity: '1.0000', unitCost: '10.0000' }] }).lines[0]).toMatchObject({ productId });
    expect(createPurchaseSchema.parse({ ...base, lines: [{ barcode: '123456', quantity: '1.0000', unitCost: '10.0000' }] }).lines[0]).toMatchObject({ barcode: '123456' });
  });

  it('rejects ambiguous, missing, or non-positive purchase values', () => {
    const base = { supplierId, warehouseId, payments: [{ method: 'CASH', amount: '10.0000' }], occurredAt: '2026-01-01T00:00:00.000Z' };
    expect(createPurchaseSchema.safeParse({ ...base, lines: [{ productId, barcode: '123456', quantity: '1.0000', unitCost: '10.0000' }] }).success).toBe(false);
    expect(createPurchaseSchema.safeParse({ ...base, lines: [{ quantity: '0.0000', unitCost: '10.0000' }] }).success).toBe(false);
  });

  it('requires explicit supplier-credit or treasury-refund settlement for a purchase return', () => {
    const base = { purchaseId: productId, lines: [{ purchaseLineId: productId, quantity: '1.0000' }], reason: 'Damaged item', occurredAt: '2026-01-01T00:00:00.000Z' };
    expect(createPurchaseReturnSchema.parse({ ...base, settlement: { kind: 'SUPPLIER_CREDIT' } }).settlement).toEqual({ kind: 'SUPPLIER_CREDIT' });
    expect(createPurchaseReturnSchema.parse({ ...base, settlement: { kind: 'TREASURY_REFUND', paymentMethod: 'CASH' } }).settlement).toEqual({ kind: 'TREASURY_REFUND', paymentMethod: 'CASH' });
    expect(createPurchaseReturnSchema.safeParse(base).success).toBe(false);
  });
});
