import { describe, expect, it } from 'vitest';
import { createNoInvoiceApprovalService, createNoInvoiceReturnService, type NoInvoiceReturnsRepository } from '../../../src/modules/sales/no-invoice-return-service.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const actorUserId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const customerId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
const warehouseId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
const productId = '9f112860-9eb3-402f-b722-740616412a85';
const input = { customerId, warehouseId, lines: [{ productId, quantity: '2.0000', unitPrice: '10.0000' }], payments: [{ method: 'CASH' as const, amount: '20.0000' }], reason: 'No receipt', itemCondition: 'Unworn', occurredAt: new Date('2026-01-01T00:00:00.000Z') };
const customer = { id: customerId, organizationId, legacyId: null, name: 'Mohamed Ali', phone: null, email: null, address: null, notes: null, creditLimit: '0.0000', active: true, version: 1 };
const warehouse = { id: warehouseId, organizationId, name: 'Main warehouse', active: true };
const product = { id: productId, organizationId, categoryId: null, name: 'Oxford shirt', sku: 'OX-1', barcode: null, salePrice: '10.0000', costPrice: '5.0000', active: true, version: 1 };
const pending = { id: 'b89ef3a7-9625-4d29-bcf0-1ac0ba2db0f2', organizationId, total: '20.0000', status: 'PENDING_APPROVAL' as const };

function repository(overrides: Partial<NoInvoiceReturnsRepository> = {}): NoInvoiceReturnsRepository {
  return { findByIdempotencyKey: async () => null, findCustomer: async () => customer, findWarehouse: async () => warehouse, findProducts: async () => [product], createPending: async () => pending, ...overrides };
}

describe('no-invoice return service', () => {
  it('replays an existing pending request without revalidating master data', async () => {
    await expect(createNoInvoiceReturnService(repository({ findByIdempotencyKey: async () => pending, findCustomer: async () => { throw new Error('must not load'); } })).submit(organizationId, actorUserId, 'retry-1', input)).resolves.toEqual({ ok: true, salesReturn: pending, replayed: true });
  });

  it('rejects unavailable customer and warehouse records', async () => {
    await expect(createNoInvoiceReturnService(repository({ findCustomer: async () => null })).submit(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'CUSTOMER_UNAVAILABLE' });
    await expect(createNoInvoiceReturnService(repository({ findCustomer: async () => ({ ...customer, active: false }) })).submit(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'CUSTOMER_UNAVAILABLE' });
    await expect(createNoInvoiceReturnService(repository({ findWarehouse: async () => null })).submit(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'WAREHOUSE_UNAVAILABLE' });
    await expect(createNoInvoiceReturnService(repository({ findWarehouse: async () => ({ ...warehouse, active: false }) })).submit(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'WAREHOUSE_UNAVAILABLE' });
  });

  it('rejects missing or inactive products and mismatched refunds', async () => {
    await expect(createNoInvoiceReturnService(repository({ findProducts: async () => [] })).submit(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PRODUCT_UNAVAILABLE' });
    await expect(createNoInvoiceReturnService(repository({ findProducts: async () => [{ ...product, active: false }] })).submit(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PRODUCT_UNAVAILABLE' });
    await expect(createNoInvoiceReturnService(repository()).submit(organizationId, actorUserId, 'key-1', { ...input, payments: [{ method: 'CASH', amount: '19.0000' }] })).resolves.toEqual({ ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' });
  });

  it('creates a pending approval request with the manager-entered total', async () => {
    let command: unknown;
    const service = createNoInvoiceReturnService(repository({ createPending: async (received) => { command = received; return pending; } }));
    await expect(service.submit(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: true, salesReturn: pending, replayed: false });
    expect(command).toMatchObject({ id: expect.any(String), organizationId, actorUserId, idempotencyKey: 'key-1', total: '20.0000', input });
  });

  it('approves only an existing pending request with the finance actor', async () => {
    await expect(createNoInvoiceApprovalService({ findPending: async () => null, approve: async () => { throw new Error('must not approve'); } }).approve(organizationId, actorUserId, pending.id)).resolves.toEqual({ ok: false, reason: 'RETURN_NOT_PENDING' });
    let command: unknown;
    const service = createNoInvoiceApprovalService({ findPending: async () => pending, approve: async (received) => { command = received; return { id: pending.id, total: pending.total }; } });
    await expect(service.approve(organizationId, actorUserId, pending.id)).resolves.toEqual({ ok: true, salesReturn: { id: pending.id, total: pending.total } });
    expect(command).toEqual({ id: pending.id, organizationId, financeUserId: actorUserId });
  });
});
