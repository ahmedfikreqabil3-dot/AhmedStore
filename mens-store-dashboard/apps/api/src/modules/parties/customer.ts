import { randomUUID } from 'node:crypto';
import type { CreateCustomerInput, Customer } from '@ahmed-store/contracts';

export interface CustomerRepository {
  list(organizationId: string): Promise<Customer[]>;
  create(customer: Customer): Promise<Customer>;
}

export function createCustomerService(repository: CustomerRepository) {
  return {
    async list(organizationId: string) {
      return repository.list(organizationId);
    },
    async create(organizationId: string, input: CreateCustomerInput) {
      const customer = await repository.create({ id: randomUUID(), organizationId, legacyId: null, ...input, active: true, version: 1 });
      return { ok: true as const, customer };
    }
  };
}
