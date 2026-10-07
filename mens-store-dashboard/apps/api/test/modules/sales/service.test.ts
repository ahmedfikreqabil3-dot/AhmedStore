import { describe, expect, it } from 'vitest';
import { createSalesService, type SalesRepository } from '../../../src/modules/sales/service.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const actorUserId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const customerId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
const warehouseId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
const productId = '9f112860-9eb3-402f-b722-740616412a85';
const input = { customerId, warehouseId, lines: [{ productId, quantity: '2.0000', unitPrice: '10.0000', discount: '1.0000' }], payments: [{ method: 'CASH' as const, amount: '19.0000' }], occurredAt: new Date('2026-01-01T00:00:00.000Z') };
const customer = { id: customerId, organizationId, legacyId: null, name: 'Mohamed Ali', phone: null, email: null, address: null, notes: null, creditLimit: '0.0000', active: true, version: 1 };
const warehouse = { id: warehouseId, organizationId, name: 'Main warehouse', active: true };
const product = { id: productId, organizationId, categoryId: null, name: 'Oxford shirt', sku: 'OX-1', barcode: null, salePrice: '10.0000', costPrice: '5.0000', active: true, version: 1 };
const postedSale = { id: 'b89ef3a7-9625-4d29-bcf0-1ac0ba2db0f2', organizationId, customerId, warehouseId, subtotal: '20.0000', discount: '1.0000', total: '19.0000', occurredAt: input.occurredAt };

function repository(overrides: Partial<SalesRepository> = {}): SalesRepository {
  return {
    findByIdempotencyKey: async () => null,
    findCustomer: async () => customer,
    findWarehouse: async () => warehouse,
    findProducts: async () => [product],
    post: async () => ({ ok: true, sale: postedSale }),
    ...overrides
  };
}

describe('sales service', () => {
  it('replays a prior idempotent sale without checking master data or stock', async () => {
    await expect(createSalesService(repository({ findByIdempotencyKey: async () => postedSale, findCustomer: async () => { throw new Error('must not load'); } })).post(organizationId, actorUserId, 'retry-1', input)).resolves.toEqual({ ok: true, sale: postedSale, replayed: true });
  });

  it('rejects unavailable customers and warehouses', async () => {
    await expect(createSalesService(repository({ findCustomer: async () => null })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'CUSTOMER_UNAVAILABLE' });
    await expect(createSalesService(repository({ findCustomer: async () => ({ ...customer, active: false }) })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'CUSTOMER_UNAVAILABLE' });
    await expect(createSalesService(repository({ findWarehouse: async () => null })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'WAREHOUSE_UNAVAILABLE' });
    await expect(createSalesService(repository({ findWarehouse: async () => ({ ...warehouse, active: false }) })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'WAREHOUSE_UNAVAILABLE' });
  });

  it('rejects missing or inactive products', async () => {
    await expect(createSalesService(repository({ findProducts: async () => [] })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PRODUCT_UNAVAILABLE' });
    await expect(createSalesService(repository({ findProducts: async () => [{ ...product, active: false }] })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PRODUCT_UNAVAILABLE' });
  });

  it('returns calculation errors before creating a sale', async () => {
    await expect(createSalesService(repository()).post(organizationId, actorUserId, 'key-1', { ...input, payments: [{ method: 'CASH', amount: '18.0000' }] })).resolves.toEqual({ ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' });
  });

  it('posts calculated tenant-scoped sale data and preserves stock failures', async () => {
    let command: unknown;
    const service = createSalesService(repository({ post: async (received) => { command = received; return { ok: true, sale: postedSale }; } }));
    await expect(service.post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: true, sale: postedSale, replayed: false });
    expect(command).toMatchObject({ id: expect.any(String), organizationId, actorUserId, idempotencyKey: 'key-1', calculated: { total: '19.0000' } });
    await expect(createSalesService(repository({ post: async () => ({ ok: false, reason: 'INSUFFICIENT_STOCK' }) })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'INSUFFICIENT_STOCK' });
  });
});
