import { describe, expect, it } from 'vitest';
import { createReturnRevisionService, type ReturnRevisionRepository } from '../../../src/modules/sales/return-revision-service.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const actorUserId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const saleId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
const saleLineId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
const returnId = 'd7bb4a09-8f06-49b7-88c6-a20b3223810b';
const input = { saleId, lines: [{ saleLineId, quantity: '2.0000' }], payments: [{ method: 'CASH' as const, amount: '20.0000' }], reason: 'Changed size', occurredAt: new Date('2026-01-02T00:00:00.000Z') };
const sale = { id: saleId, customerId: '9f112860-9eb3-402f-b722-740616412a85', warehouseId: 'b89ef3a7-9625-4d29-bcf0-1ac0ba2db0f2', lines: [{ id: saleLineId, productId: '1f2aa6c3-8853-4770-bf70-bad5fb14d83d', quantity: '5.0000', unitPrice: '10.0000', total: '50.0000' }] };
const original = { id: returnId, saleId, lines: [{ saleLineId, quantity: '1.0000' }] };
const replacement = { id: 'b89ef3a7-9625-4d29-bcf0-1ac0ba2db0f2', saleId, total: '20.0000' };

function repository(overrides: Partial<ReturnRevisionRepository> = {}): ReturnRevisionRepository {
  return { findByIdempotencyKey: async () => null, findPosted: async () => original, findSale: async () => sale, returnedQuantity: async () => '0.0000', revise: async () => ({ ok: true, salesReturn: replacement }), ...overrides };
}

describe('return revision service', () => {
  it('replays an existing replacement without reading the original', async () => {
    await expect(createReturnRevisionService(repository({ findByIdempotencyKey: async () => replacement, findPosted: async () => { throw new Error('must not load'); } })).revise(organizationId, actorUserId, returnId, 'retry-1', input)).resolves.toEqual({ ok: true, salesReturn: replacement, replayed: true });
  });

  it('rejects unavailable originals, changed sales, unavailable sales, and unavailable lines', async () => {
    await expect(createReturnRevisionService(repository({ findPosted: async () => null })).revise(organizationId, actorUserId, returnId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'RETURN_NOT_POSTED' });
    await expect(createReturnRevisionService(repository()).revise(organizationId, actorUserId, returnId, 'key-1', { ...input, saleId: '9f112860-9eb3-402f-b722-740616412a85' })).resolves.toEqual({ ok: false, reason: 'SALE_UNAVAILABLE' });
    await expect(createReturnRevisionService(repository({ findSale: async () => null })).revise(organizationId, actorUserId, returnId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'SALE_UNAVAILABLE' });
    await expect(createReturnRevisionService(repository()).revise(organizationId, actorUserId, returnId, 'key-1', { ...input, lines: [{ saleLineId: '9f112860-9eb3-402f-b722-740616412a85', quantity: '1.0000' }] })).resolves.toEqual({ ok: false, reason: 'SALE_LINE_UNAVAILABLE' });
  });

  it('excludes the original return while still enforcing cumulative remaining quantities', async () => {
    await expect(createReturnRevisionService(repository({ returnedQuantity: async () => '4.0000' })).revise(organizationId, actorUserId, returnId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'RETURN_QUANTITY_EXCEEDED' });
  });

  it('reverses and replaces using a new idempotent posting command', async () => {
    let command: unknown;
    const service = createReturnRevisionService(repository({ revise: async (received) => { command = received; return { ok: true, salesReturn: replacement }; } }));
    await expect(service.revise(organizationId, actorUserId, returnId, 'key-1', input)).resolves.toEqual({ ok: true, salesReturn: replacement, replayed: false });
    expect(command).toMatchObject({ id: expect.any(String), organizationId, actorUserId, idempotencyKey: 'key-1', original, input, sale });
  });

  it('preserves transactional payment and posted-state failures', async () => {
    await expect(createReturnRevisionService(repository({ revise: async () => ({ ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' }) })).revise(organizationId, actorUserId, returnId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' });
    await expect(createReturnRevisionService(repository({ revise: async () => ({ ok: false, reason: 'RETURN_NOT_POSTED' }) })).revise(organizationId, actorUserId, returnId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'RETURN_NOT_POSTED' });
  });
});
