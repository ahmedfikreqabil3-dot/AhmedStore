import { describe, expect, it } from 'vitest';
import { calculateInvoiceReturn } from '../../../src/modules/sales/return-calculation.js';

const sale = { id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', customerId: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', warehouseId: 'a0ac2c74-c66c-4a28-b658-34c88db36e8a', lines: [{ id: '9f112860-9eb3-402f-b722-740616412a85', productId: 'b89ef3a7-9625-4d29-bcf0-1ac0ba2db0f2', quantity: '3.0000', unitPrice: '10.0000', total: '25.0000' }] };

describe('invoice return calculation', () => {
  it('uses the original discounted line total for a full return', () => {
    const input = { saleId: sale.id, lines: [{ saleLineId: sale.lines[0].id, quantity: '3.0000' }], payments: [{ method: 'CASH' as const, amount: '25.0000' }], reason: 'Wrong size', occurredAt: new Date('2026-01-01T00:00:00.000Z') };
    expect(calculateInvoiceReturn(sale, input)).toEqual({ total: '25.0000', lines: [{ saleLineId: sale.lines[0].id, productId: sale.lines[0].productId, quantity: '3.0000', unitPrice: '10.0000', total: '25.0000' }] });
  });

  it('prorates partial returns at four decimal places with half-up rounding', () => {
    const input = { saleId: sale.id, lines: [{ saleLineId: sale.lines[0].id, quantity: '1.0000' }, { saleLineId: sale.lines[0].id, quantity: '0.0002' }], payments: [{ method: 'CASH' as const, amount: '8.3350' }], reason: 'Wrong size', occurredAt: new Date('2026-01-01T00:00:00.000Z') };
    expect(calculateInvoiceReturn(sale, input)).toMatchObject({ total: '8.3350', lines: [{ total: '8.3333' }, { total: '0.0017' }] });
  });
});
