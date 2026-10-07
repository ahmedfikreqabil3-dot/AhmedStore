import { randomUUID } from 'node:crypto';
import type { Category, CreateCategoryInput } from '@ahmed-store/contracts';

export interface CategoryRepository {
  findByName(organizationId: string, name: string): Promise<Category | null>;
  create(category: Category): Promise<Category>;
  archive(id: string, organizationId: string, archivedAt: Date): Promise<Category | null>;
}

export type CreateCategoryResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'CATEGORY_EXISTS' };

export function createCategoryService(repository: CategoryRepository, now = () => new Date()) {
  return {
    async create(organizationId: string, input: CreateCategoryInput): Promise<CreateCategoryResult> {
      if (await repository.findByName(organizationId, input.name)) return { ok: false, reason: 'CATEGORY_EXISTS' };
      const category = await repository.create({ id: randomUUID(), organizationId, name: input.name, archivedAt: null });
      return { ok: true, category };
    },
    async archive(id: string, organizationId: string) {
      return repository.archive(id, organizationId, now());
    }
  };
}
