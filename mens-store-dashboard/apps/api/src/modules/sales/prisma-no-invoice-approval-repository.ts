import { Prisma, type PrismaClient } from '@prisma/client';
import { can } from '../identity/authorization.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { recordCustomerCredit } from '../parties/customer-ledger.js';
import type { NoInvoiceApprovalRepository } from './no-invoice-return-service.js';
const units=(value:Prisma.Decimal)=>BigInt(value.toFixed(4).replace('.',''));
export function createPrismaNoInvoiceApprovalRepository(prisma:PrismaClient):NoInvoiceApprovalRepository{return {
  async listPending(organizationId){const rows=await prisma.salesReturn.findMany({where:{organizationId,saleId:null,status:'PENDING_APPROVAL'},orderBy:[{occurredAt:'asc'},{id:'asc'}]});return rows.map(row=>({id:row.id,organizationId:row.organizationId,customerId:row.customerId,warehouseId:row.warehouseId,actorUserId:row.actorUserId,reason:row.reason,total:row.total.toFixed(4),status:'PENDING_APPROVAL' as const,occurredAt:row.occurredAt}));},
  async findPending(id,organizationId){const row=await prisma.salesReturn.findFirst({where:{id,organizationId,saleId:null,status:{in:['PENDING_APPROVAL','POSTED']}}});return row&&{id:row.id,organizationId:row.organizationId,total:row.total.toFixed(4),status:row.status};},
  async approve({id,organizationId,financeUserId}){return retryWriteConflict(()=>prisma.$transaction(async tx=>{
    const actor=await tx.user.findFirst({where:{id:financeUserId,organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'returns:approve_no_invoice'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
    const pending=await tx.salesReturn.findFirst({where:{id,organizationId,saleId:null,status:{in:['PENDING_APPROVAL','POSTED']}},include:{lines:true,payments:true}});if(!pending)return {ok:false as const,reason:'RETURN_NOT_PENDING' as const};
    if(pending.status==='POSTED')return {ok:true as const,salesReturn:{id:pending.id,total:pending.total.toFixed(4)}};
    const customer=await tx.customer.findFirst({where:{id:pending.customerId,organizationId,active:true},select:{id:true}});if(!customer)return {ok:false as const,reason:'CUSTOMER_UNAVAILABLE' as const};
    const warehouse=await tx.warehouse.findFirst({where:{id:pending.warehouseId,organizationId,active:true},select:{id:true}});if(!warehouse)return {ok:false as const,reason:'WAREHOUSE_UNAVAILABLE' as const};
    const ids=[...new Set(pending.lines.map(line=>line.productId))];const products=await tx.product.findMany({where:{id:{in:ids},organizationId,active:true},select:{id:true}});if(ids.length===0||products.length!==ids.length)return {ok:false as const,reason:'PRODUCT_UNAVAILABLE' as const};
    const total=units(pending.total);if(pending.payments.reduce((sum,payment)=>sum+units(payment.amount),0n)!==total||pending.lines.reduce((sum,line)=>sum+units(line.total),0n)!==total)return {ok:false as const,reason:'PAYMENT_TOTAL_MISMATCH' as const};
    const row=await tx.salesReturn.update({where:{id:pending.id},data:{status:'POSTED',approvedByUserId:financeUserId}});
    await tx.inventoryTransaction.createMany({data:pending.lines.map(line=>({id:crypto.randomUUID(),organizationId,warehouseId:pending.warehouseId,productId:line.productId,type:'SALE_RETURN',quantity:line.quantity,referenceType:'SalesReturn',referenceId:pending.id,occurredAt:pending.occurredAt}))});
    await tx.treasuryTransaction.createMany({data:pending.payments.filter(payment=>payment.method!=='CREDIT').map(payment=>({id:crypto.randomUUID(),organizationId,type:'RETURN_REFUND',paymentMethod:payment.method,amount:payment.amount,sourceType:'SalesReturn',sourceId:pending.id,actorUserId:financeUserId,occurredAt:pending.occurredAt}))});
    await recordCustomerCredit(tx,{organizationId,customerId:pending.customerId,actorUserId:financeUserId,sourceId:pending.id,occurredAt:pending.occurredAt,type:'RETURN_CREDIT'},pending.payments);
    await tx.auditEvent.create({data:{organizationId,actorUserId:financeUserId,action:'NO_INVOICE_RETURN_APPROVED',entityType:'SalesReturn',entityId:pending.id}});
    return {ok:true as const,salesReturn:{id:row.id,total:row.total.toFixed(4)}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));}
};}
