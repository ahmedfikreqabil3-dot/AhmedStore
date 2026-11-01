import { Prisma, type PrismaClient } from '@prisma/client';
import { inventoryMovementSchema } from '@ahmed-store/contracts';
import { can } from '../identity/authorization.js';
import type { InventoryMovementRepository } from './movement.js';
import { minimumStockFrom } from './stock-integrity.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';

export function createPrismaInventoryMovementRepository(prisma:PrismaClient):InventoryMovementRepository {
  return {
    async findByIdempotencyKey(organizationId,idempotencyKey){
      const row=await prisma.inventoryTransaction.findUnique({where:{organizationId_idempotencyKey:{organizationId,idempotencyKey}}});
      return row && inventoryMovementSchema.parse({...row,quantity:row.quantity.toFixed(4)});
    },
    async findProduct(id,organizationId){const row=await prisma.product.findFirst({where:{id,organizationId}});return row && {...row,salePrice:row.salePrice.toFixed(4),costPrice:row.costPrice.toFixed(4)};},
    async findWarehouse(id,organizationId){return prisma.warehouse.findFirst({where:{id,organizationId}});},
    async post({actorUserId,...movement}){
      return retryWriteConflict(()=>prisma.$transaction(async tx=>{
        const existing=await tx.inventoryTransaction.findUnique({where:{organizationId_idempotencyKey:{organizationId:movement.organizationId,idempotencyKey:movement.idempotencyKey!}}});
        if(existing)return {ok:true as const,movement:inventoryMovementSchema.parse({...existing,quantity:existing.quantity.toFixed(4)}),replayed:true};
        const product=await tx.product.findFirst({where:{id:movement.productId,organizationId:movement.organizationId,active:true},select:{id:true}});
        if(!product)return {ok:false as const,reason:'PRODUCT_UNAVAILABLE' as const};
        const warehouse=await tx.warehouse.findFirst({where:{id:movement.warehouseId,organizationId:movement.organizationId,active:true},select:{id:true}});
        if(!warehouse)return {ok:false as const,reason:'WAREHOUSE_UNAVAILABLE' as const};
        const actor=await tx.user.findFirst({where:{id:actorUserId,organizationId:movement.organizationId,active:true},select:{role:true}});
        if(!actor || !can(actor.role,'inventory:write'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
        const quantity=new Prisma.Decimal(movement.quantity);
        if(movement.type==='OPENING_BALANCE'){
          if(quantity.isNegative())return {ok:false as const,reason:'INVALID_OPENING_BALANCE' as const};
          const prior=await tx.inventoryTransaction.findFirst({where:{organizationId:movement.organizationId,warehouseId:movement.warehouseId,productId:movement.productId},select:{id:true}});
          if(prior)return {ok:false as const,reason:'OPENING_ALREADY_EXISTS' as const};
        }
        if(quantity.isNegative() && (await minimumStockFrom(tx,movement.organizationId,movement.warehouseId,movement.productId,movement.occurredAt)).lessThan(quantity.negated()))return {ok:false as const,reason:'INSUFFICIENT_STOCK' as const};
        const row=await tx.inventoryTransaction.create({data:movement});
        await tx.auditEvent.create({data:{organizationId:movement.organizationId,actorUserId,action:'INVENTORY_MOVEMENT_POSTED',entityType:'InventoryTransaction',entityId:row.id,details:{warehouseId:movement.warehouseId,productId:movement.productId,quantity:movement.quantity,referenceType:movement.referenceType,referenceId:movement.referenceId}}});
        return {ok:true as const,movement:inventoryMovementSchema.parse({...row,quantity:row.quantity.toFixed(4)}),replayed:false};
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
    }
  };
}
