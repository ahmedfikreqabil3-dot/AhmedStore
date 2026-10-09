import { describe, expect, it } from 'vitest';
import { createCategorySchema, createInventoryMovementSchema, createProductSchema, createWarehouseSchema, stockQuerySchema } from '../src/catalogue.js';

describe('catalogue contracts', () => {
  it('trims valid category names', () => {
    expect(createCategorySchema.parse({ name: ' Shirts ' })).toEqual({ name: 'Shirts' });
  });

  it('rejects blank or oversized category names', () => {
    expect(createCategorySchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false);
  });

  it('normalizes SKU while retaining decimal price strings exactly', () => {
    expect(createProductSchema.parse({ name: 'Oxford Shirt', sku: ' sh-1 ', barcode: null, categoryId: null, salePrice: '150.2500', costPrice: '100.1250' })).toMatchObject({ sku: 'SH-1', salePrice: '150.2500' });
  });

  it('rejects numeric values outside the supported decimal contract', () => {
    expect(createProductSchema.safeParse({ name: 'Oxford Shirt', sku: 'SH-1', barcode: null, categoryId: null, salePrice: '1.12345', costPrice: '1' }).success).toBe(false);
  });

  it('trims warehouse names', () => {
    expect(createWarehouseSchema.parse({ name: ' Main warehouse ' })).toEqual({ name: 'Main warehouse' });
  });

  it('accepts a product, optional warehouse, and historical stock boundary', () => {
    expect(stockQuerySchema.parse({ productId: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', asOf: '2026-01-01T00:00:00.000Z' })).toMatchObject({ productId: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f' });
    expect(stockQuerySchema.safeParse({ productId: 'not-a-uuid', asOf: 'bad-date' }).success).toBe(false);
    expect(stockQuerySchema.parse({ productId: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', branchId: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', asOf: '2026-01-01T00:00:00.000Z' }).warehouseId).toBe('f710274a-4b51-49bd-a31f-d6a8ab81b01a');
    expect(stockQuerySchema.safeParse({ productId: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', warehouseId: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', branchId: 'a0ac2c74-c66c-4a28-b658-34c88db36e8a', asOf: '2026-01-01T00:00:00.000Z' }).success).toBe(false);
  });

  it('accepts signed nonzero stock movements and rejects zero quantities', () => {
    const movement = { productId: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', warehouseId: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', type: 'ADJUSTMENT', quantity: '-2.0000', referenceType: 'COUNT', referenceId: 'count-1', occurredAt: '2026-01-01T00:00:00.000Z' };
    expect(createInventoryMovementSchema.parse(movement)).toMatchObject({ quantity: '-2.0000' });
    expect(createInventoryMovementSchema.safeParse({ ...movement, quantity: '-0.0000' }).success).toBe(false);
  });
});
