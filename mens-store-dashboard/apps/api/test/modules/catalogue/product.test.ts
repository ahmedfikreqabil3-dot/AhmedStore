import { describe, expect, it } from 'vitest';
import { createProductService, type ProductRepository } from '../../../src/modules/catalogue/product.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const category = { id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', organizationId, name: 'Shirts', archivedAt: null };
const input = { name: 'Oxford Shirt', sku: 'SH-1', barcode: '123456', categoryId: category.id, salePrice: '150.2500', costPrice: '100.1250' };

function repository(overrides: Partial<ProductRepository> = {}): ProductRepository {
  return { findBySku: async () => null, findByBarcode: async () => null, findCategory: async () => category, create: async (product) => product, ...overrides };
}

describe('product service', () => {
  it('creates active versioned products with precise price strings', async () => {
    const result = await createProductService(repository()).create(organizationId, input);
    expect(result).toMatchObject({ ok: true, product: { organizationId, active: true, version: 1, salePrice: '150.2500' } });
  });

  it('rejects duplicate SKU and barcode values', async () => {
    const existing = { id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', organizationId, ...input, active: true, version: 1 };
    await expect(createProductService(repository({ findBySku: async () => existing })).create(organizationId, input)).resolves.toEqual({ ok: false, reason: 'SKU_EXISTS' });
    await expect(createProductService(repository({ findByBarcode: async () => existing })).create(organizationId, input)).resolves.toEqual({ ok: false, reason: 'BARCODE_EXISTS' });
  });

  it('rejects categories that do not belong to the active organization', async () => {
    await expect(createProductService(repository({ findCategory: async () => null })).create(organizationId, input)).resolves.toEqual({ ok: false, reason: 'CATEGORY_UNAVAILABLE' });
    await expect(createProductService(repository({ findCategory: async () => ({ ...category, archivedAt: new Date() }) })).create(organizationId, input)).resolves.toEqual({ ok: false, reason: 'CATEGORY_UNAVAILABLE' });
  });
});
