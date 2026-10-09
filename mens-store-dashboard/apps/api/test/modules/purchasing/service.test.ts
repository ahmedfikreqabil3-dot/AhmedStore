import { describe, expect, it } from 'vitest';
import { createPurchaseService, type PurchaseRepository } from '../../../src/modules/purchasing/service.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const actorUserId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const supplierId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
const warehouseId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
const productId = '9f112860-9eb3-402f-b722-740616412a85';
const input = { supplierId, warehouseId, lines: [{ barcode: 'BC-1', quantity: '2.0000', unitCost: '10.0000' }], payments: [{ method: 'CASH' as const, amount: '20.0000' }], occurredAt: new Date('2026-01-01T00:00:00.000Z') };
const supplier = { id: supplierId, organizationId, name: 'Textile Importers', phone: null, email: null, address: null, notes: null, active: true, version: 1 };
const warehouse = { id: warehouseId, organizationId, name: 'Main warehouse', active: true };
const product = { id: productId, organizationId, categoryId: null, name: 'Oxford shirt', sku: 'OX-1', barcode: 'BC-1', salePrice: '150.0000', costPrice: '100.0000', active: true, version: 1 };
const posted = { id: '0e92a24a-c66c-4a28-b658-34c88db36e8a', organizationId, supplierId, warehouseId, subtotal: '20.0000', total: '20.0000', occurredAt: input.occurredAt };

function repository(overrides: Partial<PurchaseRepository> = {}): PurchaseRepository {
  return { findByIdempotencyKey: async () => null, findSupplier: async () => supplier, findWarehouse: async () => warehouse, findProducts: async (ids) => ids.includes(productId) ? [product] : [], findProductsByBarcodes: async (barcodes) => barcodes.includes('BC-1') ? [product] : [], post: async () => posted, ...overrides };
}

describe('purchase service', () => {
  it('replays an existing purchase without querying dependencies', async () => {
    const service = createPurchaseService(repository({ findByIdempotencyKey: async () => posted, findSupplier: async () => { throw new Error('must not query a replay'); } }));
    await expect(service.post(organizationId, actorUserId, 'retry-1', input)).resolves.toEqual({ ok: true, purchase: posted, replayed: true });
  });

  it('rejects unavailable supplier, warehouse, and resolved product', async () => {
    await expect(createPurchaseService(repository({ findSupplier: async () => null })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'SUPPLIER_UNAVAILABLE' });
    await expect(createPurchaseService(repository({ findSupplier: async () => ({ ...supplier, active: false }) })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'SUPPLIER_UNAVAILABLE' });
    await expect(createPurchaseService(repository({ findWarehouse: async () => null })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'WAREHOUSE_UNAVAILABLE' });
    await expect(createPurchaseService(repository({ findWarehouse: async () => ({ ...warehouse, active: false }) })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'WAREHOUSE_UNAVAILABLE' });
    await expect(createPurchaseService(repository({ findProductsByBarcodes: async () => [] })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PRODUCT_UNAVAILABLE' });
    await expect(createPurchaseService(repository({ findProductsByBarcodes: async () => [{ ...product, active: false }] })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PRODUCT_UNAVAILABLE' });
  });

  it('requires exact payment totals and posts normalized barcode lines', async () => {
    let command: unknown;
    const service = createPurchaseService(repository({ post: async (value) => { command ??= value; return posted; } }));
    await expect(service.post(organizationId, actorUserId, 'mismatch', { ...input, payments: [{ method: 'CASH', amount: '19.9999' }] })).resolves.toEqual({ ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' });
    await expect(service.post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: true, purchase: posted, replayed: false });
    await expect(service.post(organizationId, actorUserId, 'key-2', { ...input, lines: [{ productId, quantity: '2.0000', unitCost: '10.0000' }] })).resolves.toEqual({ ok: true, purchase: posted, replayed: false });
    const withoutBarcode = createPurchaseService(repository({ findProducts: async () => [{ ...product, barcode: null }] }));
    await expect(withoutBarcode.post(organizationId, actorUserId, 'key-3', { ...input, lines: [{ productId, quantity: '2.0000', unitCost: '10.0000' }] })).resolves.toEqual({ ok: true, purchase: posted, replayed: false });
    expect(command).toMatchObject({ id: expect.any(String), organizationId, actorUserId, idempotencyKey: 'key-1', input: { supplierId, warehouseId, lines: [{ productId, barcode: 'BC-1', quantity: '2.0000', unitCost: '10.0000' }] }, calculated: { total: '20.0000' } });
  });
});
