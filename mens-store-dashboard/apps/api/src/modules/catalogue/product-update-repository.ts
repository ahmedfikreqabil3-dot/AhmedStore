import { Prisma, type PrismaClient, type Product as ProductRecord } from '@prisma/client';
import type { ProductUpdateRepository } from './product-update.js';

function plain(product: ProductRecord | null) {
  return product && { ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) };
}
export function createPrismaProductUpdateRepository(prisma: PrismaClient): ProductUpdateRepository {
  return {
    transaction(work) {
      return prisma.$transaction((transaction) => work({
        async findProduct(organizationId, id) { return plain(await transaction.product.findFirst({ where: { id, organizationId } })); },
        async findBySku(organizationId, sku) { return plain(await transaction.product.findUnique({ where: { organizationId_sku: { organizationId, sku } } })); },
        async findByBarcode(organizationId, barcode) { return plain(await transaction.product.findUnique({ where: { organizationId_barcode: { organizationId, barcode } } })); },
        async findCategory(organizationId, id) { return transaction.category.findFirst({ where: { id, organizationId } }); },
        async update(organizationId, id, input) {
          const { version, ...fields } = input;
          const updated = await transaction.product.updateMany({ where: { id, organizationId, version }, data: { ...fields, version: { increment: 1 } } });
          return updated.count ? plain(await transaction.product.findFirst({ where: { id, organizationId } })) : null;
        },
        async audit(organizationId, actorUserId, productId) {
          await transaction.auditEvent.create({ data: { organizationId, actorUserId, action: 'PRODUCT_UPDATED', entityType: 'Product', entityId: productId } });
        }
      }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
  };
}
