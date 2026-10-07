import { describe, expect, it } from 'vitest';
import { createInvoiceReturnSchema, createSaleSchema } from '../src/sales.js';

const line = { productId: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', quantity: '1.0000', unitPrice: '100.0000', discount: '0.0000' };

describe('sales contracts', () => {
  it('accepts an invoice with legacy payment methods and a customer', () => {
    expect(createSaleSchema.parse({ customerId: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', warehouseId: 'a0ac2c74-c66c-4a28-b658-34c88db36e8a', lines: [line], payments: [{ method: 'CASH', amount: '50.0000' }, { method: 'INSTAPAY', amount: '50.0000' }], occurredAt: '2026-01-01T00:00:00.000Z' })).toMatchObject({ payments: [{ method: 'CASH' }, { method: 'INSTAPAY' }] });
  });

  it('rejects empty invoices, zero quantities, and invalid payment methods', () => {
    expect(createSaleSchema.safeParse({ customerId: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', warehouseId: 'a0ac2c74-c66c-4a28-b658-34c88db36e8a', lines: [], payments: [], occurredAt: '2026-01-01T00:00:00.000Z' }).success).toBe(false);
    expect(createSaleSchema.safeParse({ customerId: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', warehouseId: 'a0ac2c74-c66c-4a28-b658-34c88db36e8a', lines: [{ ...line, quantity: '0.0000' }], payments: [{ method: 'TRANSFER', amount: '0.0000' }], occurredAt: '2026-01-01T00:00:00.000Z' }).success).toBe(false);
  });

  it('requires a reason, original sale lines, and nonzero quantities for invoice returns', () => {
    const returnInput = { saleId: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', lines: [{ saleLineId: 'a0ac2c74-c66c-4a28-b658-34c88db36e8a', quantity: '1.0000' }], payments: [{ method: 'CASH', amount: '10.0000' }], reason: 'Wrong size', occurredAt: '2026-01-01T00:00:00.000Z' };
    expect(createInvoiceReturnSchema.parse(returnInput)).toMatchObject({ reason: 'Wrong size' });
    expect(createInvoiceReturnSchema.safeParse({ ...returnInput, lines: [{ ...returnInput.lines[0], quantity: '0.0000' }], reason: 'x' }).success).toBe(false);
  });
});
