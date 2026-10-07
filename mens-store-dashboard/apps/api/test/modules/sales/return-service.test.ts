import { describe, expect, it } from 'vitest';
import { createInvoiceReturnService, type ReturnsRepository } from '../../../src/modules/sales/return-service.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const actorUserId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const saleId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
const saleLineId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
const input = { saleId, lines: [{ saleLineId, quantity: '2.0000' }], payments: [{ method: 'CASH' as const, amount: '20.0000' }], reason: 'Wrong size', occurredAt: new Date('2026-01-01T00:00:00.000Z') };
const sale = { id: saleId, customerId: '9f112860-9eb3-402f-b722-740616412a85', warehouseId: 'b89ef3a7-9625-4d29-bcf0-1ac0ba2db0f2', lines: [{ id: saleLineId, productId: '1f2aa6c3-8853-4770-bf70-bad5fb14d83d', quantity: '5.0000', unitPrice: '10.0000', total: '50.0000' }] };
const salesReturn = { id: 'd7bb4a09-8f06-49b7-88c6-a20b3223810b', saleId, total: '20.0000' };

function repository(overrides: Partial<ReturnsRepository> = {}): ReturnsRepository {
  return { findByIdempotencyKey: async () => null, findSale: async () => sale, returnedQuantity: async () => '0.0000', post: async () => ({ ok: true, salesReturn }), ...overrides };
}

describe('invoice return service', () => {
  it('replays an existing return without rechecking the sale', async () => {
    await expect(createInvoiceReturnService(repository({ findByIdempotencyKey: async () => salesReturn, findSale: async () => { throw new Error('must not load sale'); } })).post(organizationId, actorUserId, 'retry-1', input)).resolves.toEqual({ ok: true, salesReturn, replayed: true });
  });

  it('rejects sales and lines outside the returnable sale', async () => {
    await expect(createInvoiceReturnService(repository({ findSale: async () => null })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'SALE_UNAVAILABLE' });
    await expect(createInvoiceReturnService(repository()).post(organizationId, actorUserId, 'key-1', { ...input, lines: [{ saleLineId: '9f112860-9eb3-402f-b722-740616412a85', quantity: '1.0000' }] })).resolves.toEqual({ ok: false, reason: 'SALE_LINE_UNAVAILABLE' });
  });

  it('rejects cumulative and duplicate-line quantities above the sold amount', async () => {
    await expect(createInvoiceReturnService(repository({ returnedQuantity: async () => '4.0000' })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'RETURN_QUANTITY_EXCEEDED' });
    await expect(createInvoiceReturnService(repository()).post(organizationId, actorUserId, 'key-1', { ...input, lines: [{ saleLineId, quantity: '3' }, { saleLineId, quantity: '3.0000' }] })).resolves.toEqual({ ok: false, reason: 'RETURN_QUANTITY_EXCEEDED' });
  });

  it('posts a validated return with actor and idempotency context', async () => {
    let command: unknown;
    const service = createInvoiceReturnService(repository({ post: async (received) => { command = received; return { ok: true, salesReturn }; } }));
    await expect(service.post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: true, salesReturn, replayed: false });
    expect(command).toMatchObject({ id: expect.any(String), organizationId, actorUserId, idempotencyKey: 'key-1', sale });
  });

  it('preserves transactional payment reconciliation failures', async () => {
    await expect(createInvoiceReturnService(repository({ post: async () => ({ ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' }) })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' });
  });
});
