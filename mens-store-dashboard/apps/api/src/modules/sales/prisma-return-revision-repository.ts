import { Prisma, type PrismaClient } from '@prisma/client';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { minimumStockFrom } from '../inventory/stock-integrity.js';
import { can } from '../identity/authorization.js';
import { recordCustomerCredit } from '../parties/customer-ledger.js';
import type { ReturnRevisionRepository } from './return-revision-service.js';
export function createPrismaReturnRevisionRepository(prisma:PrismaClient):ReturnRevisionRepository{return {
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
    return retryWriteConflict(()=>prisma.$transaction(async (transaction) => {
      const existing=await transaction.salesReturn.findUnique({where:{organizationId_idempotencyKey:{organizationId:command.organizationId,idempotencyKey:command.idempotencyKey}}});
      if(existing){if(existing.saleId===null||existing.replacesReturnId===null)return {ok:false as const,reason:'IDEMPOTENCY_KEY_CONFLICT' as const};return {ok:true as const,replayed:true,salesReturn:{id:existing.id,saleId:existing.saleId,total:existing.total.toFixed(4)}};}
      const original = await transaction.salesReturn.findFirst({ where: { id: command.original.id, organizationId: command.organizationId, status: 'POSTED',saleId:command.input.saleId }, include: { lines: true, payments: true } });
      if (!original) return { ok: false as const, reason: 'RETURN_NOT_POSTED' as const };
      const actor=await transaction.user.findFirst({where:{id:command.actorUserId,organizationId:command.organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'sales:write'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
      const sale=await transaction.sale.findFirst({where:{id:command.input.saleId,organizationId:command.organizationId,status:'POSTED'},include:{lines:true}});if(!sale)return {ok:false as const,reason:'SALE_UNAVAILABLE' as const};
      const requestedBySaleLine = new Map<string, Prisma.Decimal>();
      for (const line of command.input.lines) requestedBySaleLine.set(line.saleLineId, requestedBySaleLine.get(line.saleLineId)?.plus(line.quantity) ?? new Prisma.Decimal(line.quantity));
      for (const [saleLineId, requested] of requestedBySaleLine) {
        const returned = await transaction.returnLine.aggregate({ _sum: { quantity: true }, where: { saleLineId, salesReturn: { organizationId: command.organizationId, status: 'POSTED', id: { not: original.id } } } });
        const saleLine = sale.lines.find((candidate) => candidate.id === saleLineId);if(!saleLine)return {ok:false as const,reason:'SALE_LINE_UNAVAILABLE' as const};
        if (requested.plus(returned._sum.quantity ?? 0).greaterThan(new Prisma.Decimal(saleLine.quantity))) return { ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' as const };
      }
      const paid = command.input.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
      if (!paid.equals(new Prisma.Decimal(command.calculated.total))) return { ok: false as const, reason: 'PAYMENT_TOTAL_MISMATCH' as const };
      const required=new Map<string,bigint>();for(const line of original.lines)required.set(line.productId,(required.get(line.productId) ?? 0n)+BigInt(line.quantity.toFixed(4).replace('.','')));
      for(const [productId,quantity] of required){const floor=await minimumStockFrom(transaction,command.organizationId,original.warehouseId,productId,command.input.occurredAt);if(floor.lessThan(`${quantity/10000n}.${(quantity%10000n).toString().padStart(4,'0')}`))return {ok:false as const,reason:'INSUFFICIENT_STOCK' as const};}
      await transaction.salesReturn.update({ where: { id: original.id }, data: { status: 'VOIDED' } });
      const replacement = await transaction.salesReturn.create({ data: { id: command.id, organizationId: command.organizationId, saleId: sale.id, customerId: sale.customerId, warehouseId: sale.warehouseId, actorUserId: command.actorUserId, replacesReturnId: original.id, reason: command.input.reason, total: command.calculated.total, status: 'POSTED', idempotencyKey: command.idempotencyKey, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), saleLineId: line.saleLineId, productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, total: line.total })) }, payments: { create: command.input.payments.map((payment) => ({ id: crypto.randomUUID(), method: payment.method, amount: payment.amount })) } } });
      await transaction.inventoryTransaction.createMany({ data: [...original.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: original.warehouseId, productId: line.productId, type: 'REVERSAL' as const, quantity: line.quantity.negated(), referenceType: 'SalesReturn', referenceId: original.id, occurredAt: command.input.occurredAt })), ...command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: sale.warehouseId, productId: line.productId, type: 'SALE_RETURN' as const, quantity: line.quantity, referenceType: 'SalesReturn', referenceId: replacement.id, occurredAt: command.input.occurredAt }))] });
      await transaction.treasuryTransaction.createMany({ data: [...original.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'RETURN_REFUND_REVERSAL' as const, paymentMethod: payment.method, amount: payment.amount, sourceType: 'SalesReturn', sourceId: original.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })), ...command.input.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'RETURN_REFUND' as const, paymentMethod: payment.method, amount: payment.amount, sourceType: 'SalesReturn', sourceId: replacement.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt }))] });
      await recordCustomerCredit(transaction,{organizationId:command.organizationId,customerId:original.customerId,actorUserId:command.actorUserId,sourceId:original.id,occurredAt:command.input.occurredAt,type:'RETURN_REVERSAL'},original.payments);
      await recordCustomerCredit(transaction,{organizationId:command.organizationId,customerId:sale.customerId,actorUserId:command.actorUserId,sourceId:replacement.id,occurredAt:command.input.occurredAt,type:'RETURN_CREDIT'},command.input.payments);
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'SALES_RETURN_REVISED', entityType: 'SalesReturn', entityId: original.id } });
      return { ok: true as const, salesReturn: { id: replacement.id, saleId: replacement.saleId!, total: replacement.total.toFixed(4) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
};}
