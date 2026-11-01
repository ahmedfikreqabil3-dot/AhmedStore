import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { inventoryTransferSchema, type CreateInventoryTransferInput, type InventoryTransfer, type InventoryTransferQuery } from '@ahmed-store/contracts';
import { minimumStockFrom } from './stock-integrity.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { can } from '../identity/authorization.js';

export type TransferResult={ok:true;transfer:InventoryTransfer;replayed:boolean}|{ok:false;reason:'PRODUCT_UNAVAILABLE'|'WAREHOUSE_UNAVAILABLE'|'ACTOR_UNAVAILABLE'|'INSUFFICIENT_STOCK'};
const plain=(value:{quantity:Prisma.Decimal}&Omit<InventoryTransfer,'quantity'>):InventoryTransfer=>inventoryTransferSchema.parse({...value,quantity:value.quantity.toFixed(4)});
export function createInventoryTransferService(prisma:PrismaClient){
  return {
    async list(organizationId:string,query:InventoryTransferQuery){return prisma.$transaction(async tx=>{const where={organizationId};const [rows,total]=await Promise.all([tx.inventoryTransfer.findMany({where,orderBy:[{occurredAt:'desc'},{id:'asc'}],take:query.limit,skip:query.offset}),tx.inventoryTransfer.count({where})]);return {transfers:rows.map(plain),total,...query};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});},
    async post(organizationId:string,actorUserId:string,idempotencyKey:string,input:CreateInventoryTransferInput,requestId?:string):Promise<TransferResult>{
      return retryWriteConflict(()=>prisma.$transaction(async tx=>{
        const existing=await tx.inventoryTransfer.findUnique({where:{organizationId_idempotencyKey:{organizationId,idempotencyKey}}});
        if(existing)return {ok:true as const,transfer:plain(existing),replayed:true};
        const product=await tx.product.findFirst({where:{id:input.productId,organizationId,active:true}});
        if(!product)return {ok:false as const,reason:'PRODUCT_UNAVAILABLE' as const};
        const warehouses=await tx.warehouse.findMany({where:{id:{in:[input.sourceWarehouseId,input.destinationWarehouseId]},organizationId,active:true}});
        if(warehouses.length!==2)return {ok:false as const,reason:'WAREHOUSE_UNAVAILABLE' as const};
        const actor=await tx.user.findFirst({where:{id:actorUserId,organizationId,active:true},select:{id:true,role:true}});
        if(!actor||!can(actor.role,'inventory:write'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
        const available=await minimumStockFrom(tx,organizationId,input.sourceWarehouseId,input.productId,input.occurredAt);
        if(available.lessThan(input.quantity))return {ok:false as const,reason:'INSUFFICIENT_STOCK' as const};
        const transfer=await tx.inventoryTransfer.create({data:{id:randomUUID(),organizationId,actorUserId,idempotencyKey,productId:input.productId,sourceWarehouseId:input.sourceWarehouseId,destinationWarehouseId:input.destinationWarehouseId,quantity:input.quantity,reason:input.reason,occurredAt:input.occurredAt,productName:product.name,sku:product.sku}});
        const outgoingId=randomUUID(),incomingId=randomUUID();
        const common={organizationId,productId:input.productId,referenceType:'InventoryTransfer',referenceId:transfer.id,occurredAt:input.occurredAt};
        await tx.inventoryTransaction.createMany({data:[{...common,id:outgoingId,warehouseId:input.sourceWarehouseId,type:'TRANSFER_OUT',quantity:new Prisma.Decimal(input.quantity).negated()},{...common,id:incomingId,warehouseId:input.destinationWarehouseId,type:'TRANSFER_IN',quantity:input.quantity}]});
        await tx.auditEvent.create({data:{organizationId,actorUserId,action:'INVENTORY_TRANSFER_POSTED',entityType:'InventoryTransfer',entityId:transfer.id,requestId,details:{reason:input.reason,outgoingId,incomingId,sourceWarehouseId:input.sourceWarehouseId,destinationWarehouseId:input.destinationWarehouseId,quantity:input.quantity}}});
        return {ok:true as const,transfer:plain(transfer),replayed:false};
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
    }
  };
}
