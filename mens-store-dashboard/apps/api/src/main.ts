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
import { createSupplierService } from './modules/parties/supplier.js';
import { createPurchaseService } from './modules/purchasing/service.js';
import { createPurchaseReturnService } from './modules/purchasing/return-service.js';
import { createPurchaseRevisionService } from './modules/purchasing/revision-service.js';
import { createSalesService, type PostedSale } from './modules/sales/service.js';
import { createInvoiceReturnService } from './modules/sales/return-service.js';
import { createReturnRevisionService } from './modules/sales/return-revision-service.js';
import { createNoInvoiceApprovalService, createNoInvoiceReturnService } from './modules/sales/no-invoice-return-service.js';
import { createShiftTotalsService } from './modules/finance/shift-totals.js';
import { createShiftService } from './modules/finance/shift-service.js';
import { createExpenseService } from './modules/finance/expense-service.js';
import { createSalesExportService } from './modules/reporting/sales-export.js';
import { createSalesHistoryService } from './modules/sales/history-service.js';
import { createCategoryImportService } from './modules/catalogue/category-import.js';
import { createProductImportService } from './modules/catalogue/product-import.js';
import { createSupplierImportService } from './modules/parties/supplier-import.js';

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

const categoryImportService = createCategoryImportService({
  async findNames(organizationId, names) { const categories = await prisma.category.findMany({ where: { organizationId, name: { in: names } }, select: { name: true } }); return categories.map((category) => category.name); },
  async createAtomically(organizationId, actorUserId, categories) { await prisma.$transaction(async (transaction) => { await transaction.category.createMany({ data: categories.map((category) => ({ ...category, organizationId })) }); await transaction.auditEvent.create({ data: { organizationId, actorUserId, action: 'CATEGORIES_IMPORTED', entityType: 'CategoryImport', entityId: crypto.randomUUID() } }); }); }
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

const productImportService = createProductImportService({
  async findExisting(organizationId, skus, barcodes) { const products = await prisma.product.findMany({ where: { organizationId, OR: [{ sku: { in: skus } }, { barcode: { in: barcodes } }] }, select: { sku: true, barcode: true } }); return { skus: products.map((product) => product.sku), barcodes: products.flatMap((product) => product.barcode ? [product.barcode] : []) }; },
  async findCategories(organizationId, names) { return prisma.category.findMany({ where: { organizationId, archivedAt: null, name: { in: names } }, select: { id: true, name: true } }); },
  async createAtomically(organizationId, actorUserId, products) { await prisma.$transaction(async (transaction) => { await transaction.product.createMany({ data: products.map((product) => ({ ...product, organizationId, active: true, version: 1 })) }); await transaction.auditEvent.create({ data: { organizationId, actorUserId, action: 'PRODUCTS_IMPORTED', entityType: 'ProductImport', entityId: crypto.randomUUID() } }); }); }
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

const supplierService = createSupplierService({
  async list(organizationId) {
    return prisma.supplier.findMany({ where: { organizationId, active: true }, orderBy: { name: 'asc' } });
  },
  async create(supplier) {
    return prisma.supplier.create({ data: supplier });
  }
});

const supplierImportService = createSupplierImportService({
  async findNames(organizationId, names) { const suppliers = await prisma.supplier.findMany({ where: { organizationId, name: { in: names } }, select: { name: true } }); return suppliers.map((supplier) => supplier.name); },
  async createAtomically(organizationId, actorUserId, suppliers) { await prisma.$transaction(async (transaction) => { await transaction.supplier.createMany({ data: suppliers.map((supplier) => ({ ...supplier, organizationId, active: true, version: 1 })) }); await transaction.auditEvent.create({ data: { organizationId, actorUserId, action: 'SUPPLIERS_IMPORTED', entityType: 'SupplierImport', entityId: crypto.randomUUID() } }); }); }
});

const purchaseService = createPurchaseService({
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const purchase = await prisma.purchase.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } } });
    return purchase && { id: purchase.id, organizationId: purchase.organizationId, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, subtotal: purchase.subtotal.toFixed(4), total: purchase.total.toFixed(4), occurredAt: purchase.occurredAt };
  },
  async findSupplier(id, organizationId) { return prisma.supplier.findFirst({ where: { id, organizationId } }); },
  async findWarehouse(id, organizationId) { return prisma.warehouse.findFirst({ where: { id, organizationId } }); },
  async findProducts(ids, organizationId) { const products = await prisma.product.findMany({ where: { id: { in: ids }, organizationId } }); return products.map((product) => ({ ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) })); },
  async findProductsByBarcodes(barcodes, organizationId) { const products = await prisma.product.findMany({ where: { barcode: { in: barcodes }, organizationId } }); return products.map((product) => ({ ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) })); },
  async list(organizationId) {
    const purchases = await prisma.purchase.findMany({ where: { organizationId }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 100 });
    return purchases.map((purchase) => ({ id: purchase.id, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, status: purchase.status, total: purchase.total.toFixed(4), occurredAt: purchase.occurredAt }));
  },
  async find(organizationId, purchaseId) {
    const purchase = await prisma.purchase.findFirst({ where: { id: purchaseId, organizationId }, include: { lines: { orderBy: { lineNumber: 'asc' } } } });
    return purchase && { id: purchase.id, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, status: purchase.status, total: purchase.total.toFixed(4), occurredAt: purchase.occurredAt, lines: purchase.lines.map((line) => ({ id: line.id, lineNumber: line.lineNumber, productId: line.productId, productName: line.productName, sku: line.sku, barcode: line.barcode, quantity: line.quantity.toFixed(4), unitCost: line.unitCost.toFixed(4), total: line.total.toFixed(4) })) };
  },
  async post(command) {
    return prisma.$transaction(async (transaction) => {
      const purchase = await transaction.purchase.create({ data: { id: command.id, organizationId: command.organizationId, supplierId: command.input.supplierId, warehouseId: command.input.warehouseId, actorUserId: command.actorUserId, idempotencyKey: command.idempotencyKey, subtotal: command.calculated.subtotal, total: command.calculated.total, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line, index) => { const product = command.products.get(line.productId)!; return { id: crypto.randomUUID(), lineNumber: index + 1, productId: line.productId, productName: product.name, sku: product.sku, barcode: product.barcode, quantity: line.quantity, unitCost: line.unitCost, total: line.total }; }) }, payments: { create: command.input.payments.map((payment) => ({ id: crypto.randomUUID(), method: payment.method, amount: payment.amount })) } } });
      await transaction.inventoryTransaction.createMany({ data: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: command.input.warehouseId, productId: line.productId, type: 'PURCHASE_RECEIPT', quantity: line.quantity, referenceType: 'Purchase', referenceId: purchase.id, occurredAt: command.input.occurredAt })) });
      await transaction.treasuryTransaction.createMany({ data: command.input.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'PURCHASE_PAYMENT', paymentMethod: payment.method, amount: payment.amount, sourceType: 'Purchase', sourceId: purchase.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.supplierLedgerEntry.createMany({ data: command.input.payments.filter((payment) => payment.method === 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, supplierId: command.input.supplierId, type: 'PURCHASE_CREDIT', amount: payment.amount, sourceType: 'Purchase', sourceId: purchase.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'PURCHASE_POSTED', entityType: 'Purchase', entityId: purchase.id } });
      return { id: purchase.id, organizationId: purchase.organizationId, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, subtotal: purchase.subtotal.toFixed(4), total: purchase.total.toFixed(4), occurredAt: purchase.occurredAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
});

const purchaseReturnService = createPurchaseReturnService({
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const purchaseReturn = await prisma.purchaseReturn.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } } });
    return purchaseReturn && { id: purchaseReturn.id, purchaseId: purchaseReturn.purchaseId, total: purchaseReturn.total.toFixed(4) };
  },
  async findPurchase(id, organizationId) {
    const purchase = await prisma.purchase.findFirst({ where: { id, organizationId, status: 'POSTED' }, include: { lines: true } });
    return purchase && { id: purchase.id, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, lines: purchase.lines.map((line) => ({ id: line.id, productId: line.productId, quantity: line.quantity.toFixed(4), unitCost: line.unitCost.toFixed(4), total: line.total.toFixed(4) })) };
  },
  async returnedQuantity(purchaseLineId, organizationId) {
    const result = await prisma.purchaseReturnLine.aggregate({ _sum: { quantity: true }, where: { purchaseLineId, purchaseReturn: { organizationId, status: 'POSTED' } } });
    return (result._sum.quantity ?? new Prisma.Decimal(0)).toFixed(4);
  },
  async post(command) {
    return prisma.$transaction(async (transaction) => {
      const purchase = await transaction.purchase.findFirst({ where: { id: command.input.purchaseId, organizationId: command.organizationId, status: 'POSTED' }, include: { lines: true } });
      if (!purchase) return { ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' as const };
      const requested = new Map<string, Prisma.Decimal>();
      for (const line of command.input.lines) requested.set(line.purchaseLineId, (requested.get(line.purchaseLineId) ?? new Prisma.Decimal(0)).plus(line.quantity));
      for (const [purchaseLineId, quantity] of requested) {
        const purchaseLine = purchase.lines.find((line) => line.id === purchaseLineId);
        if (!purchaseLine) return { ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' as const };
        const returned = await transaction.purchaseReturnLine.aggregate({ _sum: { quantity: true }, where: { purchaseLineId, purchaseReturn: { organizationId: command.organizationId, status: 'POSTED' } } });
        if (quantity.plus(returned._sum.quantity ?? 0).greaterThan(purchaseLine.quantity)) return { ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' as const };
      }
      const settlementTotal = command.input.settlements.reduce((sum, settlement) => sum.plus(settlement.amount), new Prisma.Decimal(0));
      if (!settlementTotal.equals(command.calculated.total)) return { ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' as const };
      const quantitiesByProduct = new Map<string, Prisma.Decimal>();
      for (const line of command.calculated.lines) quantitiesByProduct.set(line.productId, (quantitiesByProduct.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity));
      for (const [productId, quantity] of quantitiesByProduct) {
        const stock = await transaction.inventoryTransaction.aggregate({ _sum: { quantity: true }, where: { organizationId: command.organizationId, warehouseId: purchase.warehouseId, productId, occurredAt: { lte: command.input.occurredAt } } });
        if ((stock._sum.quantity ?? new Prisma.Decimal(0)).lessThan(quantity)) return { ok: false as const, reason: 'INSUFFICIENT_STOCK' as const };
      }
      const purchaseReturn = await transaction.purchaseReturn.create({ data: { id: command.id, organizationId: command.organizationId, purchaseId: purchase.id, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, actorUserId: command.actorUserId, reason: command.input.reason, total: command.calculated.total, idempotencyKey: command.idempotencyKey, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), purchaseLineId: line.purchaseLineId, productId: line.productId, quantity: line.quantity, unitCost: line.unitCost, total: line.total })) }, settlements: { create: command.input.settlements.map((settlement) => ({ id: crypto.randomUUID(), kind: settlement.kind, paymentMethod: settlement.kind === 'TREASURY_REFUND' ? settlement.paymentMethod : null, amount: settlement.amount })) } } });
      await transaction.inventoryTransaction.createMany({ data: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: purchase.warehouseId, productId: line.productId, type: 'PURCHASE_RETURN' as const, quantity: new Prisma.Decimal(line.quantity).negated(), referenceType: 'PurchaseReturn', referenceId: purchaseReturn.id, occurredAt: command.input.occurredAt })) });
      await transaction.supplierLedgerEntry.createMany({ data: command.input.settlements.filter((settlement) => settlement.kind === 'SUPPLIER_CREDIT').map((settlement) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, supplierId: purchase.supplierId, type: 'PURCHASE_RETURN_CREDIT' as const, amount: settlement.amount, sourceType: 'PurchaseReturn', sourceId: purchaseReturn.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.treasuryTransaction.createMany({ data: command.input.settlements.filter((settlement) => settlement.kind === 'TREASURY_REFUND').map((settlement) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'PURCHASE_RETURN_REFUND' as const, paymentMethod: settlement.paymentMethod, amount: settlement.amount, sourceType: 'PurchaseReturn', sourceId: purchaseReturn.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'PURCHASE_RETURN_POSTED', entityType: 'PurchaseReturn', entityId: purchaseReturn.id } });
      return { ok: true as const, purchaseReturn: { id: purchaseReturn.id, purchaseId: purchaseReturn.purchaseId, total: purchaseReturn.total.toFixed(4) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
});

const purchaseRevisionService = createPurchaseRevisionService({
  async findByIdempotencyKey(organizationId, idempotencyKey) { const purchase = await prisma.purchase.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } } }); return purchase && { id: purchase.id, organizationId: purchase.organizationId, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, subtotal: purchase.subtotal.toFixed(4), total: purchase.total.toFixed(4), occurredAt: purchase.occurredAt }; },
  async findPosted(id, organizationId) { const purchase = await prisma.purchase.findFirst({ where: { id, organizationId, status: 'POSTED' }, include: { lines: true, payments: true } }); return purchase && { id: purchase.id, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, lines: purchase.lines.map((line) => ({ productId: line.productId, quantity: line.quantity.toFixed(4) })), payments: purchase.payments.map((payment) => ({ method: payment.method, amount: payment.amount.toFixed(4) })) }; },
  async hasReturns(purchaseId, organizationId) { return (await prisma.purchaseReturn.count({ where: { purchaseId, organizationId, status: 'POSTED' } })) > 0; },
  async findSupplier(id, organizationId) { return prisma.supplier.findFirst({ where: { id, organizationId } }); },
  async findWarehouse(id, organizationId) { return prisma.warehouse.findFirst({ where: { id, organizationId } }); },
  async findProducts(ids, organizationId) { const products = await prisma.product.findMany({ where: { id: { in: ids }, organizationId } }); return products.map((product) => ({ ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) })); },
  async findProductsByBarcodes(barcodes, organizationId) { const products = await prisma.product.findMany({ where: { barcode: { in: barcodes }, organizationId } }); return products.map((product) => ({ ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) })); },
  async revise(command) { return prisma.$transaction(async (transaction) => {
    const original = await transaction.purchase.findFirst({ where: { id: command.original.id, organizationId: command.organizationId, status: 'POSTED' }, include: { lines: true, payments: true, returns: { where: { status: 'POSTED' } } } });
    if (!original) return { ok: false as const, reason: 'PURCHASE_NOT_POSTED' as const };
    if (original.returns.length) return { ok: false as const, reason: 'PURCHASE_HAS_RETURNS' as const };
    const required = new Map<string, Prisma.Decimal>(); for (const line of original.lines) required.set(line.productId, (required.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity));
    for (const [productId, quantity] of required) { const balance = await transaction.inventoryTransaction.aggregate({ _sum: { quantity: true }, where: { organizationId: command.organizationId, warehouseId: original.warehouseId, productId, occurredAt: { lte: command.input.occurredAt } } }); if ((balance._sum.quantity ?? new Prisma.Decimal(0)).lessThan(quantity)) return { ok: false as const, reason: 'INSUFFICIENT_STOCK' as const }; }
    const paid = command.input.payments.reduce((total, payment) => total.plus(payment.amount), new Prisma.Decimal(0)); if (!paid.equals(command.calculated.total)) return { ok: false as const, reason: 'PAYMENT_TOTAL_MISMATCH' as const };
    await transaction.purchase.update({ where: { id: original.id }, data: { status: 'VOIDED' } });
    const replacement = await transaction.purchase.create({ data: { id: command.id, organizationId: command.organizationId, supplierId: command.input.supplierId, warehouseId: command.input.warehouseId, actorUserId: command.actorUserId, replacesPurchaseId: original.id, idempotencyKey: command.idempotencyKey, subtotal: command.calculated.subtotal, total: command.calculated.total, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line, index) => { const product = command.products.get(line.productId)!; return { id: crypto.randomUUID(), lineNumber: index + 1, productId: line.productId, productName: product.name, sku: product.sku, barcode: product.barcode, quantity: line.quantity, unitCost: line.unitCost, total: line.total }; }) }, payments: { create: command.input.payments.map((payment) => ({ id: crypto.randomUUID(), method: payment.method, amount: payment.amount })) } } });
    await transaction.inventoryTransaction.createMany({ data: [...original.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: original.warehouseId, productId: line.productId, type: 'REVERSAL' as const, quantity: line.quantity.negated(), referenceType: 'Purchase', referenceId: original.id, occurredAt: command.input.occurredAt })), ...command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: command.input.warehouseId, productId: line.productId, type: 'PURCHASE_RECEIPT' as const, quantity: line.quantity, referenceType: 'Purchase', referenceId: replacement.id, occurredAt: command.input.occurredAt }))] });
    await transaction.treasuryTransaction.createMany({ data: [...original.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'PURCHASE_PAYMENT_REVERSAL' as const, paymentMethod: payment.method, amount: payment.amount, sourceType: 'Purchase', sourceId: original.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })), ...command.input.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'PURCHASE_PAYMENT' as const, paymentMethod: payment.method, amount: payment.amount, sourceType: 'Purchase', sourceId: replacement.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt }))] });
    await transaction.supplierLedgerEntry.createMany({ data: [...original.payments.filter((payment) => payment.method === 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, supplierId: original.supplierId, type: 'REVERSAL' as const, amount: payment.amount, sourceType: 'Purchase', sourceId: original.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })), ...command.input.payments.filter((payment) => payment.method === 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, supplierId: command.input.supplierId, type: 'PURCHASE_CREDIT' as const, amount: payment.amount, sourceType: 'Purchase', sourceId: replacement.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt }))] });
    await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'PURCHASE_REVISED', entityType: 'Purchase', entityId: original.id } });
    return { ok: true as const, purchase: { id: replacement.id, organizationId: replacement.organizationId, supplierId: replacement.supplierId, warehouseId: replacement.warehouseId, subtotal: replacement.subtotal.toFixed(4), total: replacement.total.toFixed(4), occurredAt: replacement.occurredAt } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
});

const salesExportService = createSalesExportService({
  async list(organizationId, query) {
    const sales = await prisma.sale.findMany({ where: { organizationId, occurredAt: { gte: query.from, lte: query.to }, warehouseId: query.warehouseId, customerId: query.customerId }, include: { customer: true, warehouse: true, lines: true }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] });
    return sales.flatMap((sale) => sale.lines.map((line) => ({ saleId: sale.id, occurredAt: sale.occurredAt, customerName: sale.customer.name, warehouseName: sale.warehouse.name, productName: line.productName, sku: line.sku, quantity: line.quantity.toFixed(4), unitPrice: line.unitPrice.toFixed(4), discount: line.discount.toFixed(4), lineTotal: line.total.toFixed(4), invoiceTotal: sale.total.toFixed(4), status: sale.status })));
  },
  async audit(organizationId, actorUserId) { await prisma.auditEvent.create({ data: { organizationId, actorUserId, action: 'SALES_HISTORY_EXPORTED', entityType: 'SaleExport', entityId: crypto.randomUUID() } }); }
});

const salesHistoryService = createSalesHistoryService({
  async list(organizationId, query) {
    const where = { organizationId, occurredAt: { gte: query.from, lte: query.to }, warehouseId: query.warehouseId, customerId: query.customerId };
    const sales = await prisma.sale.findMany({ where, include: { customer: true, warehouse: true }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], skip: query.offset, take: query.limit });
    return sales.map((sale) => ({ id: sale.id, customerName: sale.customer.name, warehouseName: sale.warehouse.name, total: sale.total.toFixed(4), status: sale.status, occurredAt: sale.occurredAt }));
  },
  async count(organizationId, query) {
    return prisma.sale.count({ where: { organizationId, occurredAt: { gte: query.from, lte: query.to }, warehouseId: query.warehouseId, customerId: query.customerId } });
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

const expenseService = createExpenseService({
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const expense = await prisma.expense.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } } });
    return expense && { id: expense.id, organizationId: expense.organizationId, category: expense.category, description: expense.description, paymentMethod: expense.paymentMethod, amount: expense.amount.toFixed(4), occurredAt: expense.occurredAt };
  },
  async post(command) {
    return prisma.$transaction(async (transaction) => {
      const expense = await transaction.expense.create({ data: command });
      await transaction.treasuryTransaction.create({ data: { id: crypto.randomUUID(), organizationId: command.organizationId, type: 'EXPENSE_PAYMENT', paymentMethod: command.paymentMethod, amount: command.amount, sourceType: 'Expense', sourceId: expense.id, actorUserId: command.actorUserId, occurredAt: command.occurredAt } });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'EXPENSE_POSTED', entityType: 'Expense', entityId: expense.id } });
      return { id: expense.id, organizationId: expense.organizationId, category: expense.category, description: expense.description, paymentMethod: expense.paymentMethod, amount: expense.amount.toFixed(4), occurredAt: expense.occurredAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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

await startServer(Number(process.env.PORT ?? 3000), identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, invoiceReturnService, noInvoiceReturnService, noInvoiceApprovalService, shiftTotalsService, returnRevisionService, shiftService, expenseService, supplierService, purchaseService, purchaseReturnService, purchaseRevisionService, salesExportService, salesHistoryService, categoryImportService, productImportService, supplierImportService);
