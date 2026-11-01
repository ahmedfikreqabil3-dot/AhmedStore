import { createPrismaExpenseRepository } from './modules/finance/prisma-expense-repository.js';
import { createExpenseHistoryService } from './modules/finance/expense-history.js';
import { createPrismaShiftTotalsRepository } from './modules/finance/prisma-shift-totals-repository.js';
import { createPrismaShiftRepository } from './modules/finance/prisma-shift-repository.js';
import { createPrismaInvoiceReturnRepository } from './modules/sales/prisma-return-repository.js';
import { createPrismaReturnRevisionRepository } from './modules/sales/prisma-return-revision-repository.js';
import { createPrismaNoInvoiceReturnRepository } from './modules/sales/prisma-no-invoice-repository.js';
import { createPrismaNoInvoiceApprovalRepository } from './modules/sales/prisma-no-invoice-approval-repository.js';
import { createPrismaPurchaseRepository } from './modules/purchasing/prisma-repository.js';
import { createPrismaPurchaseReturnRepository } from './modules/purchasing/prisma-return-repository.js';
import { createPrismaPurchaseRevisionRepository } from './modules/purchasing/prisma-revision-repository.js';
import { createStockThresholdService } from './modules/inventory/threshold.js';
import { createStockCountService } from './modules/inventory/count.js';
import { createInventoryTransferService } from './modules/inventory/transfer.js';
import { createPrismaSalesRepository } from './modules/sales/prisma-repository.js';
import { createPartyUpdateService, createPrismaPartyUpdateRepository } from './modules/parties/update.js';
import { createPartyStatementService } from './modules/parties/statement.js';
import { createPartyLifecycleService } from './modules/parties/lifecycle.js';
import {createCustomerImportService} from './modules/parties/customer-import.js';
import type { PartyDirectoryQuery,PartyLifecycleInput } from '@ahmed-store/contracts';
import type { PartyStatementQuery } from '@ahmed-store/contracts';
import { Prisma, type PrismaClient } from '@prisma/client';
import { createIdentityService } from './modules/identity/service.js';
import { createSessionService } from './modules/identity/session.js';
import { createCategoryService } from './modules/catalogue/category.js';
import { createProductService } from './modules/catalogue/product.js';
import { createProductUpdateService } from './modules/catalogue/product-update.js';
import { createPrismaProductUpdateRepository } from './modules/catalogue/product-update-repository.js';
import { createWarehouseService } from './modules/catalogue/warehouse.js';
import { createStockService } from './modules/inventory/stock.js';
import { createInventoryMovementService } from './modules/inventory/movement.js';
import { createPrismaInventoryMovementRepository } from './modules/inventory/movement-repository.js';
import { createCustomerService } from './modules/parties/customer.js';
import { createSupplierService } from './modules/parties/supplier.js';
import { createPurchaseService } from './modules/purchasing/service.js';
import { createPurchaseReturnService } from './modules/purchasing/return-service.js';
import { createPurchaseRevisionService } from './modules/purchasing/revision-service.js';
import { createSalesService } from './modules/sales/service.js';
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

export function createApplicationServices(prisma:PrismaClient){

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

const productReader = createProductService({
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

const productService = { ...productReader, ...createProductUpdateService(createPrismaProductUpdateRepository(prisma)) };

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

const inventoryMovementService = createInventoryMovementService(createPrismaInventoryMovementRepository(prisma));

const partyUpdates=createPartyUpdateService(createPrismaPartyUpdateRepository(prisma));
const partyStatements=createPartyStatementService(prisma);
const partyLifecycle=createPartyLifecycleService(prisma);
const customerReader = createCustomerService({
  async list(organizationId) {
    const customers = await prisma.customer.findMany({ where: { organizationId, active: true }, orderBy: { name: 'asc' } });
    return customers.map((customer) => ({ ...customer, creditLimit: customer.creditLimit.toFixed(4) }));
  },
  async create(customer) {
    const created = await prisma.customer.create({ data: customer });
    return { ...created, creditLimit: created.creditLimit.toFixed(4) };
  }
});

const customerService={...customerReader,update:partyUpdates.customer,imports:createCustomerImportService(prisma),statement:(organizationId:string,partyId:string,query:PartyStatementQuery)=>partyStatements.read(organizationId,'customers',partyId,query),directory:(organizationId:string,query:PartyDirectoryQuery)=>partyLifecycle.directory(organizationId,'customers',query),lifecycle:(organizationId:string,actorUserId:string,id:string,input:PartyLifecycleInput)=>partyLifecycle.change(organizationId,actorUserId,'customers',id,input)};
const supplierReader = createSupplierService({
  async list(organizationId) {
    return prisma.supplier.findMany({ where: { organizationId, active: true }, orderBy: { name: 'asc' } });
  },
  async create(supplier) {
    return prisma.supplier.create({ data: supplier });
  }
});

const supplierService={...supplierReader,update:partyUpdates.supplier,statement:(organizationId:string,partyId:string,query:PartyStatementQuery)=>partyStatements.read(organizationId,'suppliers',partyId,query),directory:(organizationId:string,query:PartyDirectoryQuery)=>partyLifecycle.directory(organizationId,'suppliers',query),lifecycle:(organizationId:string,actorUserId:string,id:string,input:PartyLifecycleInput)=>partyLifecycle.change(organizationId,actorUserId,'suppliers',id,input)};
const supplierImportService = createSupplierImportService({
  async findNames(organizationId, names) { const suppliers = await prisma.supplier.findMany({ where: { organizationId, name: { in: names } }, select: { name: true } }); return suppliers.map((supplier) => supplier.name); },
  async createAtomically(organizationId, actorUserId, suppliers) { await prisma.$transaction(async (transaction) => { await transaction.supplier.createMany({ data: suppliers.map((supplier) => ({ ...supplier, organizationId, active: true, version: 1 })) }); await transaction.auditEvent.create({ data: { organizationId, actorUserId, action: 'SUPPLIERS_IMPORTED', entityType: 'SupplierImport', entityId: crypto.randomUUID() } }); }); }
});

const purchaseService = createPurchaseService(createPrismaPurchaseRepository(prisma));

const purchaseReturnService = createPurchaseReturnService(createPrismaPurchaseReturnRepository(prisma));

const purchaseRevisionService = createPurchaseRevisionService(createPrismaPurchaseRevisionRepository(prisma));

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

const salesService = createSalesService(createPrismaSalesRepository(prisma));

const invoiceReturnService = createInvoiceReturnService(createPrismaInvoiceReturnRepository(prisma));

const returnRevisionService = createReturnRevisionService(createPrismaReturnRevisionRepository(prisma));

const noInvoiceReturnService = createNoInvoiceReturnService(createPrismaNoInvoiceReturnRepository(prisma));

const noInvoiceApprovalService = createNoInvoiceApprovalService(createPrismaNoInvoiceApprovalRepository(prisma));

const shiftTotalsService = createShiftTotalsService(createPrismaShiftTotalsRepository(prisma));

const expenseService = {...createExpenseService(createPrismaExpenseRepository(prisma)),...createExpenseHistoryService(prisma)};



const shiftService = createShiftService(createPrismaShiftRepository(prisma), (organizationId, openedAt, closedAt, actorUserId) => shiftTotalsService.summarize(organizationId, openedAt, closedAt, actorUserId));

const inventoryTransferService=createInventoryTransferService(prisma);
const stockCountService=createStockCountService(prisma);
const stockThresholdService=createStockThresholdService(prisma);

return {identityService,authenticationService,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,customerService,salesService,invoiceReturnService,noInvoiceReturnService,noInvoiceApprovalService,shiftTotalsService,returnRevisionService,shiftService,expenseService,supplierService,purchaseService,purchaseReturnService,purchaseRevisionService,salesExportService,salesHistoryService,categoryImportService,productImportService,supplierImportService,inventoryTransferService,stockCountService,stockThresholdService};
}
