import { Prisma } from '@prisma/client';
import type { Category, Product, UpdateProductInput } from '@ahmed-store/contracts';

export type ProductUpdateResult = { ok: true; product: Product } | { ok: false; reason: 'PRODUCT_NOT_FOUND' | 'VERSION_CONFLICT' | 'SKU_EXISTS' | 'BARCODE_EXISTS' | 'CATEGORY_UNAVAILABLE' | 'PRODUCT_CONFLICT' };
export interface ProductUpdateTransaction {
  findProduct(organizationId: string, id: string): Promise<Product | null>;
  findBySku(organizationId: string, sku: string): Promise<Product | null>;
  findByBarcode(organizationId: string, barcode: string): Promise<Product | null>;
  findCategory(organizationId: string, id: string): Promise<Category | null>;
  update(organizationId: string, id: string, input: UpdateProductInput): Promise<Product | null>;
  audit(organizationId: string, actorUserId: string, productId: string): Promise<void>;
}
export interface ProductUpdateRepository {
  transaction<T>(work: (transaction: ProductUpdateTransaction) => Promise<T>): Promise<T>;
}
export function createProductUpdateService(repository: ProductUpdateRepository) {
  return {
    async update(organizationId: string, actorUserId: string, id: string, input: UpdateProductInput): Promise<ProductUpdateResult> {
      try {
        return await repository.transaction(async (transaction): Promise<ProductUpdateResult> => {
          const current = await transaction.findProduct(organizationId, id);
          if (!current) return { ok: false, reason: 'PRODUCT_NOT_FOUND' };
          if (current.version !== input.version) return { ok: false, reason: 'VERSION_CONFLICT' };
          const sameSku = await transaction.findBySku(organizationId, input.sku);
          if (sameSku && sameSku.id !== id) return { ok: false, reason: 'SKU_EXISTS' };
          if (input.barcode) {
            const sameBarcode = await transaction.findByBarcode(organizationId, input.barcode);
            if (sameBarcode && sameBarcode.id !== id) return { ok: false, reason: 'BARCODE_EXISTS' };
          }
          if (input.categoryId) {
            const category = await transaction.findCategory(organizationId, input.categoryId);
            if (!category || category.archivedAt) return { ok: false, reason: 'CATEGORY_UNAVAILABLE' };
          }
          const product = await transaction.update(organizationId, id, input);
          if (!product) return { ok: false, reason: 'VERSION_CONFLICT' };
          await transaction.audit(organizationId, actorUserId, id);
          return { ok: true, product };
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { ok: false, reason: 'PRODUCT_CONFLICT' };
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return { ok: false, reason: 'VERSION_CONFLICT' };
        throw error;
      }
    }
  };
}
