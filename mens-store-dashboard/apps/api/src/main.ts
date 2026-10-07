import { PrismaClient } from '@prisma/client';
import { startServer } from './server.js';
import { createIdentityService } from './modules/identity/service.js';
import { createSessionService } from './modules/identity/session.js';
import { createCategoryService } from './modules/catalogue/category.js';
import { createProductService } from './modules/catalogue/product.js';
import { createWarehouseService } from './modules/catalogue/warehouse.js';
import { createStockService } from './modules/inventory/stock.js';
import { createInventoryMovementService } from './modules/inventory/movement.js';

const prisma = new PrismaClient();
const identityService = createIdentityService({
  async findByEmail(organizationId, email) {
    const user = await prisma.user.findUnique({ where: { organizationId_email: { organizationId, email } } });
    return user;
  },
  async create(user) {
    return prisma.user.create({ data: user });
  },
  async createAuditEvent(input) {
    await prisma.auditEvent.create({ data: input });
  }
});

const authenticationService = createSessionService({
  async findUserByEmail(organizationId, email) {
    return prisma.user.findUnique({ where: { organizationId_email: { organizationId, email } } });
  },
  async createSession(input) { await prisma.session.create({ data: input }); },
  async findSession(tokenHash) {
    return prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  },
  async revokeSession(id, revokedAt) { await prisma.session.update({ where: { id }, data: { revokedAt } }); },
  async createAuditEvent(input) { await prisma.auditEvent.create({ data: input }); }
});

const userDirectoryService = {
  async list(organizationId: string) {
    const users = await prisma.user.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
    return users.map(({ passwordHash: _passwordHash, active: _active, ...user }) => user);
  }
};

const categoryService = createCategoryService({
  async list(organizationId: string) {
    return prisma.category.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: 'asc' } });
  },
  async findByName(organizationId: string, name: string) {
    return prisma.category.findUnique({ where: { organizationId_name: { organizationId, name } } });
  },
  async create(category) { return prisma.category.create({ data: category }); },
  async archive(id, organizationId, archivedAt) {
    const updated = await prisma.category.updateMany({ where: { id, organizationId, archivedAt: null }, data: { archivedAt } });
    return updated.count === 0 ? null : prisma.category.findUnique({ where: { id } });
  }
});

const productService = createProductService({
  async list(organizationId) {
    const products = await prisma.product.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
    return products.map((product) => ({ ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) }));
  },
  async findBySku(organizationId, sku) {
    const product = await prisma.product.findUnique({ where: { organizationId_sku: { organizationId, sku } } });
    return product && { ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) };
  },
  async findByBarcode(organizationId, barcode) {
    const product = await prisma.product.findUnique({ where: { organizationId_barcode: { organizationId, barcode } } });
    return product && { ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) };
  },
  async findCategory(id, organizationId) {
    return prisma.category.findFirst({ where: { id, organizationId } });
  },
  async create(product) {
    const created = await prisma.product.create({ data: product });
    return { ...created, salePrice: created.salePrice.toFixed(4), costPrice: created.costPrice.toFixed(4) };
  }
});

const warehouseService = createWarehouseService({
  async list(organizationId) {
    return prisma.warehouse.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
  },
  async findByName(organizationId, name) {
    return prisma.warehouse.findUnique({ where: { organizationId_name: { organizationId, name } } });
  },
  async create(warehouse) {
    return prisma.warehouse.create({ data: warehouse });
  }
});

const stockService = createStockService({
  async quantityAsOf({ organizationId, productId, warehouseId, asOf }) {
    const balance = await prisma.inventoryTransaction.aggregate({
      _sum: { quantity: true },
      where: { organizationId, productId, warehouseId, occurredAt: { lte: asOf } }
    });
    return balance._sum.quantity?.toFixed(4) ?? '0.0000';
  }
});

const inventoryMovementService = createInventoryMovementService({
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const movement = await prisma.inventoryTransaction.findFirst({ where: { organizationId, idempotencyKey } });
    return movement && { ...movement, type: movement.type as 'OPENING_BALANCE' | 'ADJUSTMENT', quantity: movement.quantity.toFixed(4) };
  },
  async findProduct(id, organizationId) {
    const product = await prisma.product.findFirst({ where: { id, organizationId } });
    return product && { ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) };
  },
  async findWarehouse(id, organizationId) {
    return prisma.warehouse.findFirst({ where: { id, organizationId } });
  },
  async post({ actorUserId, ...movement }) {
    return prisma.$transaction(async (transaction) => {
      const created = await transaction.inventoryTransaction.create({ data: movement });
      await transaction.auditEvent.create({ data: { organizationId: movement.organizationId, actorUserId, action: 'INVENTORY_MOVEMENT_POSTED', entityType: 'InventoryTransaction', entityId: created.id } });
      return { ...created, type: created.type as 'OPENING_BALANCE' | 'ADJUSTMENT', quantity: created.quantity.toFixed(4) };
    });
  }
});

await startServer(Number(process.env.PORT ?? 3000), identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService);
