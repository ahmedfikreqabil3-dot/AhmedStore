import { randomUUID } from 'node:crypto';
import type { CreateWarehouseInput, Warehouse } from '@ahmed-store/contracts';

export interface WarehouseRepository {
  list(organizationId: string): Promise<Warehouse[]>;
  findByName(organizationId: string, name: string): Promise<Warehouse | null>;
  create(warehouse: Warehouse): Promise<Warehouse>;
}

export function createWarehouseService(repository: WarehouseRepository) {
  return {
    async list(organizationId: string) {
      return repository.list(organizationId);
    },
    async create(organizationId: string, input: CreateWarehouseInput): Promise<{ ok: true; warehouse: Warehouse } | { ok: false; reason: 'WAREHOUSE_EXISTS' }> {
      if (await repository.findByName(organizationId, input.name)) return { ok: false, reason: 'WAREHOUSE_EXISTS' };
      const warehouse = await repository.create({ id: randomUUID(), organizationId, name: input.name, active: true });
      return { ok: true, warehouse };
    }
  };
}
