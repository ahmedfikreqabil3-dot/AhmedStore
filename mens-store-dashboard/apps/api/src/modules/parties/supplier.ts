import { randomUUID } from 'node:crypto';
import type { CreateSupplierInput, Supplier } from '@ahmed-store/contracts';

export interface SupplierRepository {
  list(organizationId: string): Promise<Supplier[]>;
  create(supplier: Supplier): Promise<Supplier>;
}

export function createSupplierService(repository: SupplierRepository) {
  return {
    async list(organizationId: string) {
      return repository.list(organizationId);
    },
    async create(organizationId: string, input: CreateSupplierInput) {
      const supplier = await repository.create({ id: randomUUID(), organizationId, ...input, active: true, version: 1 });
      return { ok: true as const, supplier };
    }
  };
}
