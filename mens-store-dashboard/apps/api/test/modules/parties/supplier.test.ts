import { describe, expect, it } from 'vitest';
import { createSupplierService, type SupplierRepository } from '../../../src/modules/parties/supplier.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const input = { name: 'Textile Importers', phone: '01012345678', email: 'orders@example.test', address: 'Cairo', notes: 'Net 30' };

function repository(overrides: Partial<SupplierRepository> = {}): SupplierRepository {
  return { list: async () => [], create: async (supplier) => supplier, ...overrides };
}

describe('supplier service', () => {
  it('lists suppliers only for the requested organization', async () => {
    const supplier = { id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', organizationId, ...input, active: true, version: 1 };
    await expect(createSupplierService(repository({ list: async (requestedOrganizationId) => requestedOrganizationId === organizationId ? [supplier] : [] })).list(organizationId)).resolves.toEqual([supplier]);
  });

  it('creates an active versioned supplier in the organization', async () => {
    const result = await createSupplierService(repository()).create(organizationId, input);
    expect(result).toMatchObject({ ok: true, supplier: { organizationId, active: true, version: 1, ...input } });
  });
});
