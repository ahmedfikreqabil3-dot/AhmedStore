import { randomUUID } from 'node:crypto';
import type { Category, CreateProductInput, Product } from '@ahmed-store/contracts';

export interface ProductRepository {
  list(organizationId: string): Promise<Product[]>;
  findBySku(organizationId: string, sku: string): Promise<Product | null>;
  findByBarcode(organizationId: string, barcode: string): Promise<Product | null>;
  findCategory(id: string, organizationId: string): Promise<Category | null>;
  create(product: Product): Promise<Product>;
}

export type CreateProductResult =
  | { ok: true; product: Product }
  | { ok: false; reason: 'SKU_EXISTS' | 'BARCODE_EXISTS' | 'CATEGORY_UNAVAILABLE' };

export function createProductService(repository: ProductRepository) {
  return {
    async list(organizationId: string) {
      return repository.list(organizationId);
    },
    async create(organizationId: string, input: CreateProductInput): Promise<CreateProductResult> {
      if (await repository.findBySku(organizationId, input.sku)) return { ok: false, reason: 'SKU_EXISTS' };
      if (input.barcode && await repository.findByBarcode(organizationId, input.barcode)) return { ok: false, reason: 'BARCODE_EXISTS' };
      if (input.categoryId) {
        const category = await repository.findCategory(input.categoryId, organizationId);
        if (!category || category.archivedAt) return { ok: false, reason: 'CATEGORY_UNAVAILABLE' };
      }
      const product = await repository.create({ id: randomUUID(), organizationId, ...input, active: true, version: 1 });
      return { ok: true, product };
    }
  };
}
