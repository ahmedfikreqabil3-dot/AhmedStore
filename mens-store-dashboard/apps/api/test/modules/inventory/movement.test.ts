import { describe, expect, it } from 'vitest';
import { createInventoryMovementService, type InventoryMovementRepository } from '../../../src/modules/inventory/movement.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const actorUserId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const productId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
const warehouseId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
const input = { productId, warehouseId, type: 'OPENING_BALANCE' as const, quantity: '5.2500', referenceType: 'OPENING', referenceId: 'import-1', occurredAt: new Date('2026-01-01T00:00:00.000Z') };
const product = { id: productId, organizationId, categoryId: null, name: 'Oxford shirt', sku: 'OX-1', barcode: null, salePrice: '150.0000', costPrice: '100.0000', active: true, version: 1 };
const warehouse = { id: warehouseId, organizationId, name: 'Main warehouse', active: true };

function repository(overrides: Partial<InventoryMovementRepository> = {}): InventoryMovementRepository {
  return {
    findByIdempotencyKey: async () => null,
    findProduct: async () => product,
    findWarehouse: async () => warehouse,
    post: async ({ actorUserId: _actorUserId, ...movement }) => movement,
    ...overrides
  };
}

describe('inventory movement service', () => {
  it('replays an existing idempotent movement without revalidating or posting', async () => {
    const existing = { id: '9f112860-9eb3-402f-b722-740616412a85', organizationId, idempotencyKey: 'retry-1', ...input };
    await expect(createInventoryMovementService(repository({ findByIdempotencyKey: async () => existing, findProduct: async () => { throw new Error('must not load product'); } })).post(organizationId, actorUserId, 'retry-1', input)).resolves.toEqual({ ok: true, movement: existing, replayed: true });
  });

  it('rejects a missing or inactive product before posting', async () => {
    await expect(createInventoryMovementService(repository({ findProduct: async () => null })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PRODUCT_UNAVAILABLE' });
    await expect(createInventoryMovementService(repository({ findProduct: async () => ({ ...product, active: false }) })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'PRODUCT_UNAVAILABLE' });
  });

  it('rejects a missing or inactive warehouse before posting', async () => {
    await expect(createInventoryMovementService(repository({ findWarehouse: async () => null })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'WAREHOUSE_UNAVAILABLE' });
    await expect(createInventoryMovementService(repository({ findWarehouse: async () => ({ ...warehouse, active: false }) })).post(organizationId, actorUserId, 'key-1', input)).resolves.toEqual({ ok: false, reason: 'WAREHOUSE_UNAVAILABLE' });
  });

  it('posts an immutable movement with tenant, actor, and idempotency context', async () => {
    let posted: unknown;
    const service = createInventoryMovementService(repository({ post: async (movement) => { posted = movement; const { actorUserId: _actorUserId, ...stored } = movement; return stored; } }));
    const result = await service.post(organizationId, actorUserId, 'key-1', input);
    expect(result).toMatchObject({ ok: true, replayed: false, movement: { organizationId, idempotencyKey: 'key-1', ...input } });
    expect(posted).toMatchObject({ organizationId, actorUserId, idempotencyKey: 'key-1', ...input, id: expect.any(String) });
  });
});
