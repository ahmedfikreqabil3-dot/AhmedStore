import { Prisma, PrismaClient } from '@prisma/client';
import { startServer } from './server.js';
import { createIdentityService } from './modules/identity/service.js';
import { createSessionService } from './modules/identity/session.js';
import { createCategoryService } from './modules/catalogue/category.js';
import { createProductService } from './modules/catalogue/product.js';
import { createWarehouseService } from './modules/catalogue/warehouse.js';
import { createStockService } from './modules/inventory/stock.js';
import { createInventoryMovementService } from './modules/inventory/movement.js';
import { createCustomerService } from './modules/parties/customer.js';
import { createSalesService, type PostedSale } from './modules/sales/service.js';

const prisma = new PrismaClient();
function toPostedSale(sale: { id: string; organizationId: string; customerId: string; warehouseId: string; subtotal: Prisma.Decimal; discount: Prisma.Decimal; total: Prisma.Decimal; occurredAt: Date }): PostedSale {
  return { ...sale, subtotal: sale.subtotal.toFixed(4), discount: sale.discount.toFixed(4), total: sale.total.toFixed(4) };
}
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

const customerService = createCustomerService({
  async list(organizationId) {
    const customers = await prisma.customer.findMany({ where: { organizationId, active: true }, orderBy: { name: 'asc' } });
    return customers.map((customer) => ({ ...customer, creditLimit: customer.creditLimit.toFixed(4) }));
  },
  async create(customer) {
    const created = await prisma.customer.create({ data: customer });
    return { ...created, creditLimit: created.creditLimit.toFixed(4) };
  }
});

const salesService = createSalesService({
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const sale = await prisma.sale.findFirst({ where: { organizationId, idempotencyKey } });
    return sale && toPostedSale(sale);
  },
  async findCustomer(id, organizationId) {
    const customer = await prisma.customer.findFirst({ where: { id, organizationId } });
    return customer && { ...customer, creditLimit: customer.creditLimit.toFixed(4) };
  },
  async findWarehouse(id, organizationId) {
    return prisma.warehouse.findFirst({ where: { id, organizationId } });
  },
  async findProducts(ids, organizationId) {
    const products = await prisma.product.findMany({ where: { id: { in: ids }, organizationId } });
    return products.map((product) => ({ ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) }));
  },
  async post(command) {
    return prisma.$transaction(async (transaction) => {
      const requiredByProduct = new Map<string, Prisma.Decimal>();
      for (const line of command.input.lines) {
        const quantity = new Prisma.Decimal(line.quantity);
        requiredByProduct.set(line.productId, requiredByProduct.get(line.productId)?.plus(quantity) ?? quantity);
      }
      for (const [productId, required] of requiredByProduct) {
        const balance = await transaction.inventoryTransaction.aggregate({
          _sum: { quantity: true },
          where: { organizationId: command.organizationId, warehouseId: command.input.warehouseId, productId, occurredAt: { lte: command.input.occurredAt } }
        });
        if ((balance._sum.quantity ?? new Prisma.Decimal(0)).lessThan(required)) return { ok: false as const, reason: 'INSUFFICIENT_STOCK' as const };
      }
      const sale = await transaction.sale.create({
        data: {
          id: command.id,
          organizationId: command.organizationId,
          customerId: command.input.customerId,
          warehouseId: command.input.warehouseId,
          actorUserId: command.actorUserId,
          idempotencyKey: command.idempotencyKey,
          subtotal: command.calculated.subtotal,
          discount: command.calculated.discount,
          total: command.calculated.total,
          occurredAt: command.input.occurredAt,
          lines: { create: command.calculated.lines.map((line, index) => ({ id: crypto.randomUUID(), lineNumber: index + 1, productId: line.productId, productName: command.products.get(line.productId)!.name, sku: command.products.get(line.productId)!.sku, quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount, total: line.total })) },
          payments: { create: command.input.payments.map((payment) => ({ id: crypto.randomUUID(), method: payment.method, amount: payment.amount })) }
        }
      });
      await transaction.inventoryTransaction.createMany({ data: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: command.input.warehouseId, productId: line.productId, type: 'SALE_ISSUE', quantity: new Prisma.Decimal(line.quantity).negated(), referenceType: 'Sale', referenceId: sale.id, occurredAt: command.input.occurredAt })) });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'SALE_POSTED', entityType: 'Sale', entityId: sale.id } });
      return { ok: true as const, sale: toPostedSale(sale) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
});

await startServer(Number(process.env.PORT ?? 3000), identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
