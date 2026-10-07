import { describe, expect, it } from 'vitest';
import { createCategoryService, type CategoryRepository } from '../../../src/modules/catalogue/category.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';

describe('category service', () => {
  it('creates an active category when its organization name is unused', async () => {
    let savedName = '';
    const repository: CategoryRepository = { list: async () => [], findByName: async () => null, create: async (category) => { savedName = category.name; return category; }, archive: async () => null };
    const service = createCategoryService(repository);
    const result = await service.create(organizationId, { name: 'Shirts' });
    expect(result.ok).toBe(true);
    expect(savedName).toBe('Shirts');
    if (result.ok) expect(result.category.archivedAt).toBeNull();
    await expect(service.archive('missing', organizationId)).resolves.toBeNull();
  });

  it('rejects duplicate names and archives rather than deletes', async () => {
    const existing = { id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', organizationId, name: 'Shirts', archivedAt: null };
    let archivedAt: Date | undefined;
    const repository: CategoryRepository = { list: async () => [existing], findByName: async () => existing, create: async () => { throw new Error('must not create'); }, archive: async (_id, _organizationId, date) => { archivedAt = date; return { ...existing, archivedAt: date }; } };
    const service = createCategoryService(repository, () => new Date('2026-01-01T00:00:00Z'));
    await expect(service.list(organizationId)).resolves.toEqual([existing]);
    await expect(service.create(organizationId, { name: 'Shirts' })).resolves.toEqual({ ok: false, reason: 'CATEGORY_EXISTS' });
    await expect(service.archive(existing.id, organizationId)).resolves.toMatchObject({ id: existing.id });
    expect(archivedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
