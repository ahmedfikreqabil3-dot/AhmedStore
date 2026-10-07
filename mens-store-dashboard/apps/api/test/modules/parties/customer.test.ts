import { describe, expect, it } from 'vitest';
import { createCustomerService, type CustomerRepository } from '../../../src/modules/parties/customer.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const input = { name: 'Mohamed Ali', phone: '01012345678', email: 'mohamed@example.test', address: 'Cairo', notes: 'VIP', creditLimit: '5000.0000' };

function repository(overrides: Partial<CustomerRepository> = {}): CustomerRepository {
  return { list: async () => [], create: async (customer) => customer, ...overrides };
}

describe('customer service', () => {
  it('lists customers only for the requested organization', async () => {
    const customer = { id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', organizationId, legacyId: null, ...input, active: true, version: 1 };
    await expect(createCustomerService(repository({ list: async (requestedOrganizationId) => requestedOrganizationId === organizationId ? [customer] : [] })).list(organizationId)).resolves.toEqual([customer]);
  });

  it('creates an active versioned customer without assigning a legacy identifier', async () => {
    const result = await createCustomerService(repository()).create(organizationId, input);
    expect(result).toMatchObject({ ok: true, customer: { organizationId, legacyId: null, active: true, version: 1, creditLimit: '5000.0000' } });
  });
});
