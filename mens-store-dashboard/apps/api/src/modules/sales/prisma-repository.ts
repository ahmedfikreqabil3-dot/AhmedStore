import { minimumStockFrom } from '../inventory/stock-integrity.js';
import { creditUnits, customerDebt, ledgerUnits, recordCustomerCredit } from '../parties/customer-ledger.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { PostedSale, SalesRepository } from './service.js';
function toPostedSale(sale:{id:string;organizationId:string;customerId:string;warehouseId:string;subtotal:Prisma.Decimal;discount:Prisma.Decimal;total:Prisma.Decimal;occurredAt:Date}):PostedSale{return {id:sale.id,organizationId:sale.organizationId,customerId:sale.customerId,warehouseId:sale.warehouseId,occurredAt:sale.occurredAt,subtotal:sale.subtotal.toFixed(4),discount:sale.discount.toFixed(4),total:sale.total.toFixed(4)};}
export function createPrismaSalesRepository(prisma:PrismaClient):SalesRepository{return {
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
    return retryWriteConflict(()=>prisma.$transaction(async (transaction) => {
      const existing=await transaction.sale.findUnique({where:{organizationId_idempotencyKey:{organizationId:command.organizationId,idempotencyKey:command.idempotencyKey}}});
      if(existing)return {ok:true as const,sale:toPostedSale(existing),replayed:true};
      const customer=await transaction.customer.findFirst({where:{id:command.input.customerId,organizationId:command.organizationId,active:true},select:{id:true,creditLimit:true}});
      if(!customer)return {ok:false as const,reason:'CUSTOMER_UNAVAILABLE' as const};
      const credit=creditUnits(command.input.payments),limit=ledgerUnits(customer.creditLimit.toFixed(4));
      if(credit>0n&&limit>0n&&(await customerDebt(transaction,command.organizationId,customer.id))+credit>limit)return {ok:false as const,reason:'CREDIT_LIMIT_EXCEEDED' as const};
      const warehouse=await transaction.warehouse.findFirst({where:{id:command.input.warehouseId,organizationId:command.organizationId,active:true},select:{id:true}});
      if(!warehouse)return {ok:false as const,reason:'WAREHOUSE_UNAVAILABLE' as const};
      const productIds=[...new Set(command.input.lines.map(line=>line.productId))];
      const products=await transaction.product.findMany({where:{id:{in:productIds},organizationId:command.organizationId,active:true},select:{id:true}});
      if(products.length!==productIds.length)return {ok:false as const,reason:'PRODUCT_UNAVAILABLE' as const};
      const requiredByProduct = new Map<string, Prisma.Decimal>();
      for (const line of command.input.lines) {
        const quantity = new Prisma.Decimal(line.quantity);
        requiredByProduct.set(line.productId, requiredByProduct.get(line.productId)?.plus(quantity) ?? quantity);
      }
      for (const [productId, required] of requiredByProduct) {
        const balance=await minimumStockFrom(transaction,command.organizationId,command.input.warehouseId,productId,command.input.occurredAt);
        if (balance.lessThan(required)) return { ok: false as const, reason: 'INSUFFICIENT_STOCK' as const };
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
      await recordCustomerCredit(transaction,{organizationId:command.organizationId,customerId:customer.id,actorUserId:command.actorUserId,sourceId:sale.id,occurredAt:command.input.occurredAt,type:'SALE_CREDIT'},command.input.payments);
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'SALE_POSTED', entityType: 'Sale', entityId: sale.id } });
      return { ok: true as const, sale: toPostedSale(sale) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
};}
