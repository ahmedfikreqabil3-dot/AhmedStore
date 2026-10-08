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
import { createInvoiceReturnService } from './modules/sales/return-service.js';
import { createReturnRevisionService } from './modules/sales/return-revision-service.js';
import { createNoInvoiceApprovalService, createNoInvoiceReturnService } from './modules/sales/no-invoice-return-service.js';
import { createShiftTotalsService } from './modules/finance/shift-totals.js';
import { createShiftService } from './modules/finance/shift-service.js';

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
      await transaction.treasuryTransaction.createMany({ data: command.input.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'SALE_RECEIPT', paymentMethod: payment.method, amount: payment.amount, sourceType: 'Sale', sourceId: sale.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'SALE_POSTED', entityType: 'Sale', entityId: sale.id } });
      return { ok: true as const, sale: toPostedSale(sale) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
});

const invoiceReturnService = createInvoiceReturnService({
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const salesReturn = await prisma.salesReturn.findFirst({ where: { organizationId, idempotencyKey } });
    return salesReturn && { id: salesReturn.id, saleId: salesReturn.saleId!, total: salesReturn.total.toFixed(4) };
  },
  async findSale(id, organizationId) {
    const sale = await prisma.sale.findFirst({ where: { id, organizationId, status: 'POSTED' }, include: { lines: true } });
    return sale && { id: sale.id, customerId: sale.customerId, warehouseId: sale.warehouseId, lines: sale.lines.map((line) => ({ id: line.id, productId: line.productId, quantity: line.quantity.toFixed(4), unitPrice: line.unitPrice.toFixed(4), total: line.total.toFixed(4) })) };
  },
  async returnedQuantity(saleLineId, organizationId) {
    const quantity = await prisma.returnLine.aggregate({ _sum: { quantity: true }, where: { saleLineId, salesReturn: { organizationId, status: 'POSTED' } } });
    return (quantity._sum.quantity ?? new Prisma.Decimal(0)).toFixed(4);
  },
  async post(command) {
    return prisma.$transaction(async (transaction) => {
      const requestedBySaleLine = new Map<string, Prisma.Decimal>();
      for (const line of command.input.lines) {
        const quantity = new Prisma.Decimal(line.quantity);
        requestedBySaleLine.set(line.saleLineId, requestedBySaleLine.get(line.saleLineId)?.plus(quantity) ?? quantity);
      }
      for (const [saleLineId, requested] of requestedBySaleLine) {
        const saleLine = command.sale.lines.find((line) => line.id === saleLineId)!;
        const returned = await transaction.returnLine.aggregate({ _sum: { quantity: true }, where: { saleLineId, salesReturn: { organizationId: command.organizationId, status: 'POSTED' } } });
        if (requested.plus(returned._sum.quantity ?? 0).greaterThan(new Prisma.Decimal(saleLine.quantity))) return { ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' as const };
      }
      const total = new Prisma.Decimal(command.calculated.total);
      const paid = command.input.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
      if (!paid.equals(total)) return { ok: false as const, reason: 'PAYMENT_TOTAL_MISMATCH' as const };
      const salesReturn = await transaction.salesReturn.create({ data: { id: command.id, organizationId: command.organizationId, saleId: command.sale.id, customerId: command.sale.customerId, warehouseId: command.sale.warehouseId, actorUserId: command.actorUserId, reason: command.input.reason, total, status: 'POSTED', idempotencyKey: command.idempotencyKey, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), saleLineId: line.saleLineId, productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, total: line.total })) }, payments: { create: command.input.payments.map((payment) => ({ id: crypto.randomUUID(), method: payment.method, amount: payment.amount })) } } });
      await transaction.inventoryTransaction.createMany({ data: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: command.sale.warehouseId, productId: line.productId, type: 'SALE_RETURN', quantity: line.quantity, referenceType: 'SalesReturn', referenceId: salesReturn.id, occurredAt: command.input.occurredAt })) });
      await transaction.treasuryTransaction.createMany({ data: command.input.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'RETURN_REFUND', paymentMethod: payment.method, amount: payment.amount, sourceType: 'SalesReturn', sourceId: salesReturn.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'SALES_RETURN_POSTED', entityType: 'SalesReturn', entityId: salesReturn.id } });
      return { ok: true as const, salesReturn: { id: salesReturn.id, saleId: salesReturn.saleId!, total: salesReturn.total.toFixed(4) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
});

const returnRevisionService = createReturnRevisionService({
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const salesReturn = await prisma.salesReturn.findFirst({ where: { organizationId, idempotencyKey, replacesReturnId: { not: null } } });
    return salesReturn && { id: salesReturn.id, saleId: salesReturn.saleId!, total: salesReturn.total.toFixed(4) };
  },
  async findPosted(id, organizationId) {
    const salesReturn = await prisma.salesReturn.findFirst({ where: { id, organizationId, saleId: { not: null }, status: 'POSTED' }, include: { lines: true } });
    return salesReturn && { id: salesReturn.id, saleId: salesReturn.saleId!, lines: salesReturn.lines.map((line) => ({ saleLineId: line.saleLineId!, quantity: line.quantity.toFixed(4) })) };
  },
  async findSale(id, organizationId) {
    const sale = await prisma.sale.findFirst({ where: { id, organizationId, status: 'POSTED' }, include: { lines: true } });
    return sale && { id: sale.id, customerId: sale.customerId, warehouseId: sale.warehouseId, lines: sale.lines.map((line) => ({ id: line.id, productId: line.productId, quantity: line.quantity.toFixed(4), unitPrice: line.unitPrice.toFixed(4), total: line.total.toFixed(4) })) };
  },
  async returnedQuantity(saleLineId, organizationId, excludingReturnId) {
    const quantity = await prisma.returnLine.aggregate({ _sum: { quantity: true }, where: { saleLineId, salesReturn: { organizationId, status: 'POSTED', id: { not: excludingReturnId } } } });
    return (quantity._sum.quantity ?? new Prisma.Decimal(0)).toFixed(4);
  },
  async revise(command) {
    return prisma.$transaction(async (transaction) => {
      const original = await transaction.salesReturn.findFirst({ where: { id: command.original.id, organizationId: command.organizationId, status: 'POSTED' }, include: { lines: true, payments: true } });
      if (!original) return { ok: false as const, reason: 'RETURN_NOT_POSTED' as const };
      const requestedBySaleLine = new Map<string, Prisma.Decimal>();
      for (const line of command.input.lines) requestedBySaleLine.set(line.saleLineId, requestedBySaleLine.get(line.saleLineId)?.plus(line.quantity) ?? new Prisma.Decimal(line.quantity));
      for (const [saleLineId, requested] of requestedBySaleLine) {
        const returned = await transaction.returnLine.aggregate({ _sum: { quantity: true }, where: { saleLineId, salesReturn: { organizationId: command.organizationId, status: 'POSTED', id: { not: original.id } } } });
        const saleLine = command.sale.lines.find((candidate) => candidate.id === saleLineId)!;
        if (requested.plus(returned._sum.quantity ?? 0).greaterThan(new Prisma.Decimal(saleLine.quantity))) return { ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' as const };
      }
      const paid = command.input.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
      if (!paid.equals(new Prisma.Decimal(command.calculated.total))) return { ok: false as const, reason: 'PAYMENT_TOTAL_MISMATCH' as const };
      await transaction.salesReturn.update({ where: { id: original.id }, data: { status: 'VOIDED' } });
      const replacement = await transaction.salesReturn.create({ data: { id: command.id, organizationId: command.organizationId, saleId: command.sale.id, customerId: command.sale.customerId, warehouseId: command.sale.warehouseId, actorUserId: command.actorUserId, replacesReturnId: original.id, reason: command.input.reason, total: command.calculated.total, status: 'POSTED', idempotencyKey: command.idempotencyKey, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), saleLineId: line.saleLineId, productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, total: line.total })) }, payments: { create: command.input.payments.map((payment) => ({ id: crypto.randomUUID(), method: payment.method, amount: payment.amount })) } } });
      await transaction.inventoryTransaction.createMany({ data: [...original.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: original.warehouseId, productId: line.productId, type: 'REVERSAL' as const, quantity: line.quantity.negated(), referenceType: 'SalesReturn', referenceId: original.id, occurredAt: command.input.occurredAt })), ...command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: command.sale.warehouseId, productId: line.productId, type: 'SALE_RETURN' as const, quantity: line.quantity, referenceType: 'SalesReturn', referenceId: replacement.id, occurredAt: command.input.occurredAt }))] });
      await transaction.treasuryTransaction.createMany({ data: [...original.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'RETURN_REFUND_REVERSAL' as const, paymentMethod: payment.method, amount: payment.amount, sourceType: 'SalesReturn', sourceId: original.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })), ...command.input.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'RETURN_REFUND' as const, paymentMethod: payment.method, amount: payment.amount, sourceType: 'SalesReturn', sourceId: replacement.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt }))] });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'SALES_RETURN_REVISED', entityType: 'SalesReturn', entityId: original.id } });
      return { ok: true as const, salesReturn: { id: replacement.id, saleId: replacement.saleId!, total: replacement.total.toFixed(4) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
});

const noInvoiceReturnService = createNoInvoiceReturnService({
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const salesReturn = await prisma.salesReturn.findFirst({ where: { organizationId, idempotencyKey, status: 'PENDING_APPROVAL' } });
    return salesReturn && { id: salesReturn.id, organizationId: salesReturn.organizationId, total: salesReturn.total.toFixed(4), status: 'PENDING_APPROVAL' as const };
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
  async createPending(command) {
    const salesReturn = await prisma.salesReturn.create({ data: { id: command.id, organizationId: command.organizationId, customerId: command.input.customerId, warehouseId: command.input.warehouseId, actorUserId: command.actorUserId, reason: `${command.input.reason}\nCondition: ${command.input.itemCondition}`, total: command.total, status: 'PENDING_APPROVAL', idempotencyKey: command.idempotencyKey, occurredAt: command.input.occurredAt, lines: { create: command.input.lines.map((line) => ({ id: crypto.randomUUID(), productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, total: new Prisma.Decimal(line.quantity).mul(line.unitPrice).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP) })) }, payments: { create: command.input.payments.map((payment) => ({ id: crypto.randomUUID(), method: payment.method, amount: payment.amount })) } } });
    return { id: salesReturn.id, organizationId: salesReturn.organizationId, total: salesReturn.total.toFixed(4), status: 'PENDING_APPROVAL' as const };
  }
});

const noInvoiceApprovalService = createNoInvoiceApprovalService({
  async listPending(organizationId) {
    const returns = await prisma.salesReturn.findMany({ where: { organizationId, saleId: null, status: 'PENDING_APPROVAL' }, orderBy: { occurredAt: 'asc' } });
    return returns.map((salesReturn) => ({ id: salesReturn.id, organizationId: salesReturn.organizationId, customerId: salesReturn.customerId, warehouseId: salesReturn.warehouseId, actorUserId: salesReturn.actorUserId, reason: salesReturn.reason, total: salesReturn.total.toFixed(4), status: 'PENDING_APPROVAL' as const, occurredAt: salesReturn.occurredAt }));
  },
  async findPending(id, organizationId) {
    const salesReturn = await prisma.salesReturn.findFirst({ where: { id, organizationId, saleId: null, status: 'PENDING_APPROVAL' } });
    return salesReturn && { id: salesReturn.id, organizationId: salesReturn.organizationId, total: salesReturn.total.toFixed(4), status: 'PENDING_APPROVAL' as const };
  },
  async approve({ id, organizationId, financeUserId }) {
    return prisma.$transaction(async (transaction) => {
      const pending = await transaction.salesReturn.findFirst({ where: { id, organizationId, saleId: null, status: 'PENDING_APPROVAL' }, include: { lines: true, payments: true } });
      if (!pending) return { ok: false as const, reason: 'RETURN_NOT_PENDING' as const };
      const salesReturn = await transaction.salesReturn.update({ where: { id: pending.id }, data: { status: 'POSTED', approvedByUserId: financeUserId } });
      await transaction.inventoryTransaction.createMany({ data: pending.lines.map((line) => ({ id: crypto.randomUUID(), organizationId, warehouseId: pending.warehouseId, productId: line.productId, type: 'SALE_RETURN', quantity: line.quantity, referenceType: 'SalesReturn', referenceId: pending.id, occurredAt: pending.occurredAt })) });
      await transaction.treasuryTransaction.createMany({ data: pending.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId, type: 'RETURN_REFUND', paymentMethod: payment.method, amount: payment.amount, sourceType: 'SalesReturn', sourceId: pending.id, actorUserId: financeUserId, occurredAt: pending.occurredAt })) });
      await transaction.auditEvent.create({ data: { organizationId, actorUserId: financeUserId, action: 'NO_INVOICE_RETURN_APPROVED', entityType: 'SalesReturn', entityId: pending.id } });
      return { ok: true as const, salesReturn: { id: salesReturn.id, total: salesReturn.total.toFixed(4) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
});

const shiftTotalsService = createShiftTotalsService({
  async listEntries(organizationId, openedAt, closedAt) {
    const entries = await prisma.treasuryTransaction.findMany({ where: { organizationId, occurredAt: { gte: openedAt, lt: closedAt } }, orderBy: { occurredAt: 'asc' } });
    return entries.map((entry) => ({ type: entry.type, paymentMethod: entry.paymentMethod, amount: entry.amount.toFixed(4) }));
  }
});

function shiftRecord(shift: NonNullable<Awaited<ReturnType<typeof prisma.shift.findUnique>>>) {
  return { ...shift, expectedCash: shift.expectedCash?.toFixed(4) ?? null, countedCash: shift.countedCash?.toFixed(4) ?? null, cashDifference: shift.cashDifference?.toFixed(4) ?? null };
}

const shiftService = createShiftService({
  async findOpen(organizationId, userId) {
    const shift = await prisma.shift.findFirst({ where: { organizationId, userId, status: 'OPEN' } });
    return shift && shiftRecord(shift);
  },
  async create(organizationId, userId, openedAt) {
    return shiftRecord(await prisma.shift.create({ data: { organizationId, userId, openedAt } }));
  },
  async findById(organizationId, shiftId) {
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, organizationId } });
    return shift && shiftRecord(shift);
  },
  async close(organizationId, shiftId, userId, closedAt, reconciliation) {
    const updated = await prisma.shift.updateMany({ where: { id: shiftId, organizationId, userId, status: 'OPEN' }, data: { status: 'CLOSED', closedAt, closedByUserId: userId, ...reconciliation } });
    const shift = updated.count ? await prisma.shift.findUnique({ where: { id: shiftId } }) : null;
    return shift && shiftRecord(shift);
  },
  async review(organizationId, shiftId, reviewerUserId, reviewedAt) {
    const updated = await prisma.shift.updateMany({ where: { id: shiftId, organizationId, status: 'CLOSED' }, data: { status: 'REVIEWED', reviewedAt, reviewedByUserId: reviewerUserId } });
    const shift = updated.count ? await prisma.shift.findUnique({ where: { id: shiftId } }) : null;
    return shift && shiftRecord(shift);
  },
  async listClosed(organizationId) {
    return (await prisma.shift.findMany({ where: { organizationId, status: { in: ['CLOSED', 'REVIEWED'] } }, orderBy: { closedAt: 'desc' } })).map(shiftRecord);
  }
}, (organizationId, openedAt, closedAt) => shiftTotalsService.summarize(organizationId, openedAt, closedAt));

await startServer(Number(process.env.PORT ?? 3000), identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, invoiceReturnService, noInvoiceReturnService, noInvoiceApprovalService, shiftTotalsService, returnRevisionService, shiftService);
