import { Prisma, type PrismaClient } from '@prisma/client';
import { stockThresholdSchema, type SetStockThresholdInput, type StockThresholdQuery } from '@ahmed-store/contracts';
import { can } from '../identity/authorization.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
type ThresholdRow={id:string;productId:string;productName:string;sku:string;warehouseId:string;warehouseName:string;minimum:Prisma.Decimal;quantity:Prisma.Decimal;version:number;updatedAt:Date};
export type SetThresholdResult={ok:true;threshold:{id:string;minimum:string;version:number}}|{ok:false;reason:'PRODUCT_UNAVAILABLE'|'WAREHOUSE_UNAVAILABLE'|'ACTOR_UNAVAILABLE'|'VERSION_CONFLICT'};
export function createStockThresholdService(prisma:PrismaClient){return {
  async list(organizationId:string,query:StockThresholdQuery){
    const asOf=query.asOf ?? new Date(),warehouseId=query.warehouseId ?? null;
    const levels=Prisma.sql`SELECT t."id",t."productId",p."name" AS "productName",p."sku",t."warehouseId",w."name" AS "warehouseName",t."minimum",t."version",t."updatedAt",COALESCE((SELECT SUM(i."quantity") FROM "InventoryTransaction" i WHERE i."organizationId"=t."organizationId" AND i."warehouseId"=t."warehouseId" AND i."productId"=t."productId" AND i."occurredAt"<=${asOf.toISOString()}::timestamp),0::numeric) AS "quantity" FROM "StockThreshold" t JOIN "Product" p ON p."organizationId"=t."organizationId" AND p."id"=t."productId" AND p."active"=true JOIN "Warehouse" w ON w."organizationId"=t."organizationId" AND w."id"=t."warehouseId" AND w."active"=true WHERE t."organizationId"=${organizationId} AND (${warehouseId}::text IS NULL OR t."warehouseId"=${warehouseId})`;
    return prisma.$transaction(async tx=>{
      const [rows,totals]=await Promise.all([
        tx.$queryRaw<ThresholdRow[]>(Prisma.sql`WITH levels AS (${levels}) SELECT * FROM levels WHERE (${query.mode}='all' OR "quantity"<="minimum") ORDER BY "productName","warehouseName","id" LIMIT ${query.limit} OFFSET ${query.offset}`),
        tx.$queryRaw<Array<{total:bigint}>>(Prisma.sql`WITH levels AS (${levels}) SELECT COUNT(*) AS "total" FROM levels WHERE (${query.mode}='all' OR "quantity"<="minimum")`)
      ]);
      return {thresholds:rows.map(row=>stockThresholdSchema.parse({...row,minimum:row.minimum.toFixed(4),quantity:row.quantity.toFixed(4)})),total:Number(totals[0]!.total),limit:query.limit,offset:query.offset,asOf};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  },
  async set(organizationId:string,actorUserId:string,input:SetStockThresholdInput):Promise<SetThresholdResult>{return retryWriteConflict(()=>prisma.$transaction(async tx=>{
    const product=await tx.product.findFirst({where:{id:input.productId,organizationId,active:true},select:{id:true}});if(!product)return {ok:false as const,reason:'PRODUCT_UNAVAILABLE' as const};
    const warehouse=await tx.warehouse.findFirst({where:{id:input.warehouseId,organizationId,active:true},select:{id:true}});if(!warehouse)return {ok:false as const,reason:'WAREHOUSE_UNAVAILABLE' as const};
    const actor=await tx.user.findFirst({where:{id:actorUserId,organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'inventory:write'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
    const existing=await tx.stockThreshold.findUnique({where:{organizationId_warehouseId_productId:{organizationId,warehouseId:input.warehouseId,productId:input.productId}}});
    if((existing?.version ?? 0)!==input.version)return {ok:false as const,reason:'VERSION_CONFLICT' as const};
    const threshold=existing ? await tx.stockThreshold.update({where:{id:existing.id},data:{minimum:input.minimum,version:{increment:1}}}) : await tx.stockThreshold.create({data:{organizationId,productId:input.productId,warehouseId:input.warehouseId,minimum:input.minimum}});
    await tx.auditEvent.create({data:{organizationId,actorUserId,action:existing ? 'STOCK_THRESHOLD_UPDATED' : 'STOCK_THRESHOLD_CREATED',entityType:'StockThreshold',entityId:threshold.id,details:{productId:input.productId,warehouseId:input.warehouseId,previousMinimum:existing?.minimum.toFixed(4) ?? null,minimum:threshold.minimum.toFixed(4),version:threshold.version}}});
    return {ok:true as const,threshold:{id:threshold.id,minimum:threshold.minimum.toFixed(4),version:threshold.version}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));}
};}
