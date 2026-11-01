import { Prisma, type PrismaClient } from '@prisma/client';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { can } from '../identity/authorization.js';
import type { PurchaseRepository } from './service.js';
export function createPrismaPurchaseRepository(prisma:PrismaClient):PurchaseRepository{return {
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
    return retryWriteConflict(()=>prisma.$transaction(async (transaction) => {
      const existing=await transaction.purchase.findUnique({where:{organizationId_idempotencyKey:{organizationId:command.organizationId,idempotencyKey:command.idempotencyKey}}});
      if(existing)return {ok:true as const,replayed:true,purchase:{id:existing.id,organizationId:existing.organizationId,supplierId:existing.supplierId,warehouseId:existing.warehouseId,subtotal:existing.subtotal.toFixed(4),total:existing.total.toFixed(4),occurredAt:existing.occurredAt}};
      const supplier=await transaction.supplier.findFirst({where:{id:command.input.supplierId,organizationId:command.organizationId,active:true},select:{id:true}});if(!supplier)return {ok:false as const,reason:'SUPPLIER_UNAVAILABLE' as const};
      const warehouse=await transaction.warehouse.findFirst({where:{id:command.input.warehouseId,organizationId:command.organizationId,active:true},select:{id:true}});if(!warehouse)return {ok:false as const,reason:'WAREHOUSE_UNAVAILABLE' as const};
      const ids=[...new Set(command.input.lines.map(line=>line.productId))];const products=await transaction.product.findMany({where:{id:{in:ids},organizationId:command.organizationId,active:true},select:{id:true}});if(products.length!==ids.length)return {ok:false as const,reason:'PRODUCT_UNAVAILABLE' as const};
      const actor=await transaction.user.findFirst({where:{id:command.actorUserId,organizationId:command.organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'purchases:manage'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
      const purchase = await transaction.purchase.create({ data: { id: command.id, organizationId: command.organizationId, supplierId: command.input.supplierId, warehouseId: command.input.warehouseId, actorUserId: command.actorUserId, idempotencyKey: command.idempotencyKey, subtotal: command.calculated.subtotal, total: command.calculated.total, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line, index) => { const product = command.products.get(line.productId)!; return { id: crypto.randomUUID(), lineNumber: index + 1, productId: line.productId, productName: product.name, sku: product.sku, barcode: product.barcode, quantity: line.quantity, unitCost: line.unitCost, total: line.total }; }) }, payments: { create: command.input.payments.map((payment) => ({ id: crypto.randomUUID(), method: payment.method, amount: payment.amount })) } } });
      await transaction.inventoryTransaction.createMany({ data: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: command.input.warehouseId, productId: line.productId, type: 'PURCHASE_RECEIPT', quantity: line.quantity, referenceType: 'Purchase', referenceId: purchase.id, occurredAt: command.input.occurredAt })) });
      await transaction.treasuryTransaction.createMany({ data: command.input.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'PURCHASE_PAYMENT', paymentMethod: payment.method, amount: payment.amount, sourceType: 'Purchase', sourceId: purchase.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.supplierLedgerEntry.createMany({ data: command.input.payments.filter((payment) => payment.method === 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, supplierId: command.input.supplierId, type: 'PURCHASE_CREDIT', amount: payment.amount, sourceType: 'Purchase', sourceId: purchase.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'PURCHASE_POSTED', entityType: 'Purchase', entityId: purchase.id } });
      return {ok:true as const,replayed:false,purchase:{ id: purchase.id, organizationId: purchase.organizationId, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, subtotal: purchase.subtotal.toFixed(4), total: purchase.total.toFixed(4), occurredAt: purchase.occurredAt }};
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
};}
