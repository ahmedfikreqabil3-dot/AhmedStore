import { Prisma, type PrismaClient } from '@prisma/client';
import { minimumStockFrom } from '../inventory/stock-integrity.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { can } from '../identity/authorization.js';
import type { PurchaseReturnRepository } from './return-service.js';
export function createPrismaPurchaseReturnRepository(prisma:PrismaClient):PurchaseReturnRepository{return {
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
    return retryWriteConflict(()=>prisma.$transaction(async (transaction) => {
      const existing=await transaction.purchaseReturn.findUnique({where:{organizationId_idempotencyKey:{organizationId:command.organizationId,idempotencyKey:command.idempotencyKey}}});if(existing)return {ok:true as const,replayed:true,purchaseReturn:{id:existing.id,purchaseId:existing.purchaseId,total:existing.total.toFixed(4)}};
      const actor=await transaction.user.findFirst({where:{id:command.actorUserId,organizationId:command.organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'purchases:manage'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
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
        const stock=await minimumStockFrom(transaction,command.organizationId,purchase.warehouseId,productId,command.input.occurredAt);
        if (stock.lessThan(quantity)) return { ok: false as const, reason: 'INSUFFICIENT_STOCK' as const };
      }
      const purchaseReturn = await transaction.purchaseReturn.create({ data: { id: command.id, organizationId: command.organizationId, purchaseId: purchase.id, supplierId: purchase.supplierId, warehouseId: purchase.warehouseId, actorUserId: command.actorUserId, reason: command.input.reason, total: command.calculated.total, idempotencyKey: command.idempotencyKey, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), purchaseLineId: line.purchaseLineId, productId: line.productId, quantity: line.quantity, unitCost: line.unitCost, total: line.total })) }, settlements: { create: command.input.settlements.map((settlement) => ({ id: crypto.randomUUID(), kind: settlement.kind, paymentMethod: settlement.kind === 'TREASURY_REFUND' ? settlement.paymentMethod : null, amount: settlement.amount })) } } });
      await transaction.inventoryTransaction.createMany({ data: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: purchase.warehouseId, productId: line.productId, type: 'PURCHASE_RETURN' as const, quantity: new Prisma.Decimal(line.quantity).negated(), referenceType: 'PurchaseReturn', referenceId: purchaseReturn.id, occurredAt: command.input.occurredAt })) });
      await transaction.supplierLedgerEntry.createMany({ data: command.input.settlements.filter((settlement) => settlement.kind === 'SUPPLIER_CREDIT').map((settlement) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, supplierId: purchase.supplierId, type: 'PURCHASE_RETURN_CREDIT' as const, amount: settlement.amount, sourceType: 'PurchaseReturn', sourceId: purchaseReturn.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.treasuryTransaction.createMany({ data: command.input.settlements.filter((settlement) => settlement.kind === 'TREASURY_REFUND').map((settlement) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'PURCHASE_RETURN_REFUND' as const, paymentMethod: settlement.paymentMethod, amount: settlement.amount, sourceType: 'PurchaseReturn', sourceId: purchaseReturn.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'PURCHASE_RETURN_POSTED', entityType: 'PurchaseReturn', entityId: purchaseReturn.id } });
      return { ok: true as const, purchaseReturn: { id: purchaseReturn.id, purchaseId: purchaseReturn.purchaseId, total: purchaseReturn.total.toFixed(4) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
};}
