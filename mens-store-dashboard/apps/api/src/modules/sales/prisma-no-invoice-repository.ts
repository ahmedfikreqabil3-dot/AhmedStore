import { Prisma, type PrismaClient } from '@prisma/client';
import { can } from '../identity/authorization.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import type { ExistingNoInvoiceReturn, NoInvoiceReturnsRepository } from './no-invoice-return-service.js';
const plain=(row:{id:string;organizationId:string;total:Prisma.Decimal;status:ExistingNoInvoiceReturn['status']}):ExistingNoInvoiceReturn=>({id:row.id,organizationId:row.organizationId,total:row.total.toFixed(4),status:row.status});
export function createPrismaNoInvoiceReturnRepository(prisma:PrismaClient):NoInvoiceReturnsRepository{return {
  async findByIdempotencyKey(organizationId,idempotencyKey){const row=await prisma.salesReturn.findFirst({where:{organizationId,idempotencyKey,saleId:null}});return row&&plain(row);},
  async findCustomer(id,organizationId){const row=await prisma.customer.findFirst({where:{id,organizationId}});return row&&{...row,creditLimit:row.creditLimit.toFixed(4)};},
  async findWarehouse(id,organizationId){return prisma.warehouse.findFirst({where:{id,organizationId}});},
  async findProducts(ids,organizationId){const rows=await prisma.product.findMany({where:{id:{in:ids},organizationId}});return rows.map(row=>({...row,salePrice:row.salePrice.toFixed(4),costPrice:row.costPrice.toFixed(4)}));},
  async createPending(command){return retryWriteConflict(()=>prisma.$transaction(async tx=>{
    const existing=await tx.salesReturn.findUnique({where:{organizationId_idempotencyKey:{organizationId:command.organizationId,idempotencyKey:command.idempotencyKey}}});
    if(existing){if(existing.saleId!==null)return {ok:false as const,reason:'IDEMPOTENCY_KEY_CONFLICT' as const};return {ok:true as const,salesReturn:plain(existing),replayed:true};}
    const customer=await tx.customer.findFirst({where:{id:command.input.customerId,organizationId:command.organizationId,active:true},select:{id:true}});if(!customer)return {ok:false as const,reason:'CUSTOMER_UNAVAILABLE' as const};
    const warehouse=await tx.warehouse.findFirst({where:{id:command.input.warehouseId,organizationId:command.organizationId,active:true},select:{id:true}});if(!warehouse)return {ok:false as const,reason:'WAREHOUSE_UNAVAILABLE' as const};
    const ids=[...new Set(command.input.lines.map(line=>line.productId))];const products=await tx.product.findMany({where:{id:{in:ids},organizationId:command.organizationId,active:true},select:{id:true}});if(products.length!==ids.length)return {ok:false as const,reason:'PRODUCT_UNAVAILABLE' as const};
    const actor=await tx.user.findFirst({where:{id:command.actorUserId,organizationId:command.organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'returns:submit_no_invoice'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
    const row=await tx.salesReturn.create({data:{id:command.id,organizationId:command.organizationId,customerId:command.input.customerId,warehouseId:command.input.warehouseId,actorUserId:command.actorUserId,reason:`${command.input.reason}\nحالة المنتج: ${command.input.itemCondition}`,total:command.total,status:'PENDING_APPROVAL',idempotencyKey:command.idempotencyKey,occurredAt:command.input.occurredAt,lines:{create:command.calculatedLines.map(line=>({id:crypto.randomUUID(),productId:line.productId,quantity:line.quantity,unitPrice:line.unitPrice,total:line.total}))},payments:{create:command.input.payments.map(payment=>({id:crypto.randomUUID(),method:payment.method,amount:payment.amount}))}}});
    await tx.auditEvent.create({data:{organizationId:command.organizationId,actorUserId:command.actorUserId,action:'NO_INVOICE_RETURN_REQUESTED',entityType:'SalesReturn',entityId:row.id,details:{itemCondition:command.input.itemCondition,reason:command.input.reason,total:command.total}}});
    return {ok:true as const,salesReturn:plain(row),replayed:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));}
};}
