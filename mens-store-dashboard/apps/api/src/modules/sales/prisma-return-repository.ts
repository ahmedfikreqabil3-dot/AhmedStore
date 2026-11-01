import { Prisma, type PrismaClient } from '@prisma/client';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { can } from '../identity/authorization.js';
import { recordCustomerCredit } from '../parties/customer-ledger.js';
import type { ReturnsRepository } from './return-service.js';
export function createPrismaInvoiceReturnRepository(prisma:PrismaClient):ReturnsRepository{return {
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const salesReturn = await prisma.salesReturn.findFirst({ where: { organizationId, idempotencyKey,saleId:{not:null},replacesReturnId:null } });
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
    return retryWriteConflict(()=>prisma.$transaction(async (transaction) => {
      const existing=await transaction.salesReturn.findUnique({where:{organizationId_idempotencyKey:{organizationId:command.organizationId,idempotencyKey:command.idempotencyKey}}});
      if(existing){if(existing.saleId===null||existing.replacesReturnId!==null)return {ok:false as const,reason:'IDEMPOTENCY_KEY_CONFLICT' as const};return {ok:true as const,replayed:true,salesReturn:{id:existing.id,saleId:existing.saleId,total:existing.total.toFixed(4)}};}
      const actor=await transaction.user.findFirst({where:{id:command.actorUserId,organizationId:command.organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'sales:write'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
      const sale=await transaction.sale.findFirst({where:{id:command.input.saleId,organizationId:command.organizationId,status:'POSTED'},include:{lines:true}});if(!sale)return {ok:false as const,reason:'SALE_UNAVAILABLE' as const};
      const requestedBySaleLine = new Map<string, Prisma.Decimal>();
      for (const line of command.input.lines) {
        const quantity = new Prisma.Decimal(line.quantity);
        requestedBySaleLine.set(line.saleLineId, requestedBySaleLine.get(line.saleLineId)?.plus(quantity) ?? quantity);
      }
      for (const [saleLineId, requested] of requestedBySaleLine) {
        const saleLine = sale.lines.find((line) => line.id === saleLineId);if(!saleLine)return {ok:false as const,reason:'SALE_LINE_UNAVAILABLE' as const};
        const returned = await transaction.returnLine.aggregate({ _sum: { quantity: true }, where: { saleLineId, salesReturn: { organizationId: command.organizationId, status: 'POSTED' } } });
        if (requested.plus(returned._sum.quantity ?? 0).greaterThan(new Prisma.Decimal(saleLine.quantity))) return { ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' as const };
      }
      const total = new Prisma.Decimal(command.calculated.total);
      const paid = command.input.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
      if (!paid.equals(total)) return { ok: false as const, reason: 'PAYMENT_TOTAL_MISMATCH' as const };
      const salesReturn = await transaction.salesReturn.create({ data: { id: command.id, organizationId: command.organizationId, saleId: sale.id, customerId: sale.customerId, warehouseId: sale.warehouseId, actorUserId: command.actorUserId, reason: command.input.reason, total, status: 'POSTED', idempotencyKey: command.idempotencyKey, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), saleLineId: line.saleLineId, productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, total: line.total })) }, payments: { create: command.input.payments.map((payment) => ({ id: crypto.randomUUID(), method: payment.method, amount: payment.amount })) } } });
      await transaction.inventoryTransaction.createMany({ data: command.calculated.lines.map((line) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, warehouseId: sale.warehouseId, productId: line.productId, type: 'SALE_RETURN', quantity: line.quantity, referenceType: 'SalesReturn', referenceId: salesReturn.id, occurredAt: command.input.occurredAt })) });
      await transaction.treasuryTransaction.createMany({ data: command.input.payments.filter((payment) => payment.method !== 'CREDIT').map((payment) => ({ id: crypto.randomUUID(), organizationId: command.organizationId, type: 'RETURN_REFUND', paymentMethod: payment.method, amount: payment.amount, sourceType: 'SalesReturn', sourceId: salesReturn.id, actorUserId: command.actorUserId, occurredAt: command.input.occurredAt })) });
      await recordCustomerCredit(transaction,{organizationId:command.organizationId,customerId:sale.customerId,actorUserId:command.actorUserId,sourceId:salesReturn.id,occurredAt:command.input.occurredAt,type:'RETURN_CREDIT'},command.input.payments);
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'SALES_RETURN_POSTED', entityType: 'SalesReturn', entityId: salesReturn.id } });
      return { ok: true as const, salesReturn: { id: salesReturn.id, saleId: salesReturn.saleId!, total: salesReturn.total.toFixed(4) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
};}
