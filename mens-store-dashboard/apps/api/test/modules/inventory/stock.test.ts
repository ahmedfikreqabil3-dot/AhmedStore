import { describe, expect, it } from 'vitest';
import { createStockService } from '../../../src/modules/inventory/stock.js';

describe('stock service', () => {
  it('passes tenant, warehouse, and historical boundary to the immutable-ledger reader', async () => {
    let received: unknown;
    const service = createStockService({ quantityAsOf: async (input) => { received = input; return '5.2500'; } });
    const asOf = new Date('2026-01-01T00:00:00.000Z');
    await expect(service.quantityAsOf('org', 'product', asOf, 'warehouse')).resolves.toBe('5.2500');
    expect(received).toEqual({ organizationId: 'org', productId: 'product', warehouseId: 'warehouse', asOf });
  });
});
