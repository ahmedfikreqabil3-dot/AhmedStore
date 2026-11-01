import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { stockCountSchema, type CreateStockCountInput, type StockCount, type StockCountQuery } from '@ahmed-store/contracts';
import { can } from '../identity/authorization.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { minimumStockFrom } from './stock-integrity.js';
const units=(value:string)=>BigInt(value.replace('.',''));
// Inputs and database values are normalized to exactly four decimal places first.
const scaled=(value:string)=>units(new Prisma.Decimal(value).toFixed(4));
const formatted=(value:bigint)=>`${value<0n ? '-' : ''}${(value<0n ? -value : value)/10000n}.${((value<0n ? -value : value)%10000n).toString().padStart(4,'0')}`;
type Row=Prisma.StockCountGetPayload<{include:{lines:true}}>;
const plain=(row:Row):StockCount=>stockCountSchema.parse({...row,lines:row.lines.map(line=>({id:line.id,productId:line.productId,productName:line.productName,sku:line.sku,expectedQuantity:line.expectedQuantity.toFixed(4),countedQuantity:line.countedQuantity.toFixed(4),difference:line.difference.toFixed(4),inventoryTransactionId:line.inventoryTransactionId}))});
export type StockCountResult={ok:true;count:StockCount;replayed:boolean}|{ok:false;reason:'WAREHOUSE_UNAVAILABLE'|'PRODUCT_UNAVAILABLE'|'ACTOR_UNAVAILABLE'|'STOCK_CHANGED'|'INSUFFICIENT_STOCK'|'COUNT_RANGE_EXCEEDED'};
const include={lines:{orderBy:{productId:'asc' as const}}};
export function createStockCountService(prisma:PrismaClient){return {
  async list(organizationId:string,query:StockCountQuery){return prisma.$transaction(async tx=>{const where={organizationId};const [rows,total]=await Promise.all([tx.stockCount.findMany({where,include,orderBy:[{occurredAt:'desc'},{id:'asc'}],take:query.limit,skip:query.offset}),tx.stockCount.count({where})]);return {counts:rows.map(plain),total,...query};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});},
  async post(organizationId:string,actorUserId:string,idempotencyKey:string,input:CreateStockCountInput):Promise<StockCountResult>{return retryWriteConflict(()=>prisma.$transaction(async tx=>{
    const existing=await tx.stockCount.findUnique({where:{organizationId_idempotencyKey:{organizationId,idempotencyKey}},include});if(existing)return {ok:true as const,count:plain(existing),replayed:true};
    const warehouse=await tx.warehouse.findFirst({where:{id:input.warehouseId,organizationId,active:true},select:{id:true}});if(!warehouse)return {ok:false as const,reason:'WAREHOUSE_UNAVAILABLE' as const};
    const actor=await tx.user.findFirst({where:{id:actorUserId,organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'inventory:write'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
    const products=await tx.product.findMany({where:{organizationId,id:{in:input.lines.map(line=>line.productId)},active:true},select:{id:true,name:true,sku:true}});if(products.length!==input.lines.length)return {ok:false as const,reason:'PRODUCT_UNAVAILABLE' as const};
    const planned=[];
    for(const line of input.lines){
      const balance=(await tx.inventoryTransaction.aggregate({where:{organizationId,warehouseId:input.warehouseId,productId:line.productId,occurredAt:{lte:input.occurredAt}},_sum:{quantity:true}}))._sum.quantity;
      const current=balance ? scaled(balance.toFixed(4)) : 0n;if(current!==scaled(line.expectedQuantity))return {ok:false as const,reason:'STOCK_CHANGED' as const};
      const difference=scaled(line.countedQuantity)-current;
      if(difference>9999999999999999999n)return {ok:false as const,reason:'COUNT_RANGE_EXCEEDED' as const};
      if(difference<0n&&(await minimumStockFrom(tx,organizationId,input.warehouseId,line.productId,input.occurredAt)).lessThan(formatted(-difference)))return {ok:false as const,reason:'INSUFFICIENT_STOCK' as const};
      planned.push({...line,difference:formatted(difference),inventoryTransactionId:difference===0n ? null : randomUUID()});
    }
    const countId=randomUUID();
    await tx.stockCount.create({data:{id:countId,organizationId,warehouseId:input.warehouseId,actorUserId,idempotencyKey,reason:input.reason,occurredAt:input.occurredAt}});
    for(const line of planned){
      if(line.inventoryTransactionId)await tx.inventoryTransaction.create({data:{id:line.inventoryTransactionId,organizationId,warehouseId:input.warehouseId,productId:line.productId,type:'ADJUSTMENT',quantity:line.difference,referenceType:'StockCount',referenceId:countId,occurredAt:input.occurredAt}});
      const product=products.find(product=>product.id===line.productId)!;
      await tx.stockCountLine.create({data:{id:randomUUID(),organizationId,stockCountId:countId,productId:line.productId,productName:product.name,sku:product.sku,expectedQuantity:line.expectedQuantity,countedQuantity:line.countedQuantity,difference:line.difference,inventoryTransactionId:line.inventoryTransactionId}});
    }
    await tx.auditEvent.create({data:{organizationId,actorUserId,action:'STOCK_COUNT_POSTED',entityType:'StockCount',entityId:countId,details:{warehouseId:input.warehouseId,reason:input.reason,lines:planned}}});
    return {ok:true as const,count:plain((await tx.stockCount.findUniqueOrThrow({where:{id:countId},include}))),replayed:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));}
};}
