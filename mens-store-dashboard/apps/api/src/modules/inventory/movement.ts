import { randomUUID } from 'node:crypto';
import type { CreateInventoryMovementInput, InventoryMovement, Product, Warehouse } from '@ahmed-store/contracts';

export interface InventoryMovementRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<InventoryMovement | null>;
  findProduct(id: string, organizationId: string): Promise<Product | null>;
  findWarehouse(id: string, organizationId: string): Promise<Warehouse | null>;
  post(input: InventoryMovement & { actorUserId: string }): Promise<InventoryMovement>;
}

export type PostInventoryMovementResult =
  | { ok: true; movement: InventoryMovement; replayed: boolean }
  | { ok: false; reason: 'PRODUCT_UNAVAILABLE' | 'WAREHOUSE_UNAVAILABLE' };

export function createInventoryMovementService(repository: InventoryMovementRepository) {
  return {
    async post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateInventoryMovementInput): Promise<PostInventoryMovementResult> {
      const existing = await repository.findByIdempotencyKey(organizationId, idempotencyKey);
      if (existing) return { ok: true, movement: existing, replayed: true };
      const product = await repository.findProduct(input.productId, organizationId);
      if (!product || !product.active) return { ok: false, reason: 'PRODUCT_UNAVAILABLE' };
      const warehouse = await repository.findWarehouse(input.warehouseId, organizationId);
      if (!warehouse || !warehouse.active) return { ok: false, reason: 'WAREHOUSE_UNAVAILABLE' };
      const movement = await repository.post({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, ...input });
      return { ok: true, movement, replayed: false };
    }
  };
}
