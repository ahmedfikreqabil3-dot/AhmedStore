import { describe, expect, it } from 'vitest';
import { createWarehouseService, type WarehouseRepository } from '../../../src/modules/catalogue/warehouse.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';

describe('warehouse service', () => {
  it('lists warehouses only for the requested organization', async () => {
    const warehouse = { id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', organizationId, name: 'Main warehouse', active: true };
    const repository: WarehouseRepository = { list: async (requestedOrganizationId) => requestedOrganizationId === organizationId ? [warehouse] : [], findByName: async () => null, create: async (created) => created };
    await expect(createWarehouseService(repository).list(organizationId)).resolves.toEqual([warehouse]);
  });

  it('creates an active warehouse for an unused organization name', async () => {
    const repository: WarehouseRepository = { list: async () => [], findByName: async () => null, create: async (warehouse) => warehouse };
    await expect(createWarehouseService(repository).create(organizationId, { name: 'Main warehouse' })).resolves.toMatchObject({ ok: true, warehouse: { organizationId, active: true } });
  });

  it('rejects an organization duplicate warehouse name', async () => {
    const existing = { id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', organizationId, name: 'Main warehouse', active: true };
    const repository: WarehouseRepository = { list: async () => [], findByName: async () => existing, create: async () => { throw new Error('must not create'); } };
    await expect(createWarehouseService(repository).create(organizationId, { name: existing.name })).resolves.toEqual({ ok: false, reason: 'WAREHOUSE_EXISTS' });
  });
});
