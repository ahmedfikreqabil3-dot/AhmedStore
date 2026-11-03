import {createHash,randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient,type SaleDraft as StoredDraft} from '@prisma/client';
import {draftInputSchema,saleDraftSchema,type DraftInput,type DraftQuery,type SaleDraft,createDraftSchema,updateDraftSchema,convertDraftSchema} from '@ahmed-store/contracts';
import type {z} from 'zod';
import {calculateSaleLines} from './calculation.js';
import {createSalesService} from './service.js';
import {createPrismaSalesRepository} from './prisma-repository.js';
import {retryWriteConflict} from '../shared/retry-write-conflict.js';

export class DraftError extends Error{constructor(message:string,readonly status=409){super(message);}}
const expiry=(row:StoredDraft)=>row.kind==='QUOTATION'?new Date(row.createdAt.getTime()+30*86400000):null;
function document(row:StoredDraft,at:Date):SaleDraft{return saleDraftSchema.parse({...row,expiresAt:expiry(row),expired:row.status==='OPEN'&&!!expiry(row)&&expiry(row)!<=at,subtotal:row.subtotal.toFixed(4),discount:row.discount.toFixed(4),total:row.total.toFixed(4)});}
export function createSaleDraftService(prisma:PrismaClient,now=()=>new Date()){
  const write=<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>)=>retryWriteConflict(()=>prisma.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
  async function lock(tx:Prisma.TransactionClient,org:string,id:string,owner?:string){
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "SaleDraft" WHERE "organizationId"=${org} AND id=${id} ${owner?Prisma.sql`AND "actorUserId"=${owner}`:Prisma.empty} FOR UPDATE`);
    const row=await tx.saleDraft.findFirst({where:{id,organizationId:org,actorUserId:owner}});if(!row)throw new DraftError('DRAFT_NOT_FOUND',404);return row;
  }
  function open(row:StoredDraft,version:number,allowExpired=false){if(!allowExpired&&expiry(row)&&expiry(row)!<=now())throw new DraftError('DRAFT_EXPIRED');if(row.status!=='OPEN')throw new DraftError('DRAFT_CLOSED');if(row.version!==version)throw new DraftError('DRAFT_CHANGED');}
  async function prepare(tx:Prisma.TransactionClient,org:string,input:DraftInput){
    const customer=await tx.customer.findFirst({where:{id:input.customerId,organizationId:org,active:true}}),warehouse=await tx.warehouse.findFirst({where:{id:input.warehouseId,organizationId:org,active:true}});
    if(!customer||!warehouse)throw new DraftError('PARTY_UNAVAILABLE');
    const ids=[...new Set(input.lines.map(line=>line.productId))],products=await tx.product.findMany({where:{organizationId:org,id:{in:ids},active:true}});
    if(products.length!==ids.length)throw new DraftError('PRODUCT_UNAVAILABLE');
    const calculated=calculateSaleLines(input);if(!calculated.ok)throw new DraftError(calculated.reason,400);if(new Prisma.Decimal(calculated.sale.total).lte(0))throw new DraftError('INVALID_TOTAL',400);
    const snapshots=new Map(products.map(p=>[p.id,p]));
    return {customerId:customer.id,warehouseId:warehouse.id,customerName:customer.name,warehouseName:warehouse.name,subtotal:calculated.sale.subtotal,discount:calculated.sale.discount,total:calculated.sale.total,lines:input.lines.map(line=>({...line,productName:snapshots.get(line.productId)!.name,sku:snapshots.get(line.productId)!.sku})) as Prisma.InputJsonValue};
  }
  async function audit(tx:Prisma.TransactionClient,org:string,actor:string,id:string,action:string){await tx.auditEvent.create({data:{organizationId:org,actorUserId:actor,entityType:'SaleDraft',entityId:id,action}});}
  return {
    async list(org:string,q:DraftQuery,owner?:string){return prisma.$transaction(async tx=>{
      const where={organizationId:org,actorUserId:owner,kind:q.kind,status:q.status};const total=await tx.saleDraft.count({where}),rows=await tx.saleDraft.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:q.limit,skip:q.offset});return {items:rows.map(row=>document(row,now())),total,limit:q.limit,offset:q.offset};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});},
    async read(org:string,id:string,owner?:string){const row=await prisma.saleDraft.findFirst({where:{id,organizationId:org,actorUserId:owner}});if(!row)throw new DraftError('DRAFT_NOT_FOUND',404);return document(row,now());},
    async create(org:string,actor:string,key:string,input:z.infer<typeof createDraftSchema>){
      const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');return write(async tx=>{
        const existing=await tx.saleDraft.findUnique({where:{organizationId_idempotencyKey:{organizationId:org,idempotencyKey:key}}});
        if(existing){if(existing.actorUserId!==actor||existing.requestHash!==hash)throw new DraftError('IDEMPOTENCY_KEY_CONFLICT');return document(existing,now());}
        const data=await prepare(tx,org,input),row=await tx.saleDraft.create({data:{...data,organizationId:org,actorUserId:actor,kind:input.kind,idempotencyKey:key,requestHash:hash,conversionKey:randomUUID(),createdAt:now()}});
        await audit(tx,org,actor,row.id,'DRAFT_CREATED');return document(row,now());
      });
    },
    async update(org:string,actor:string,id:string,input:z.infer<typeof updateDraftSchema>,owner?:string){return write(async tx=>{
      const row=await lock(tx,org,id,owner);open(row,input.version);const data=await prepare(tx,org,input),updated=await tx.saleDraft.update({where:{id},data:{...data,version:{increment:1}}});await audit(tx,org,actor,id,'DRAFT_UPDATED');return document(updated,now());
    });},
    async cancel(org:string,actor:string,id:string,version:number,owner?:string){return write(async tx=>{
      const row=await lock(tx,org,id,owner);if(row.status==='CANCELLED')return document(row,now());open(row,version,true);const updated=await tx.saleDraft.update({where:{id},data:{status:'CANCELLED',version:{increment:1}}});await audit(tx,org,actor,id,'DRAFT_CANCELLED');return document(updated,now());
    });},
    async convert(org:string,actor:string,id:string,input:z.infer<typeof convertDraftSchema>,owner?:string){return write(async tx=>{
      const row=await lock(tx,org,id,owner);if(row.status==='CONVERTED')return document(row,now());open(row,input.version);
      const saved=draftInputSchema.parse({customerId:row.customerId,warehouseId:row.warehouseId,lines:row.lines}),result=await createSalesService(createPrismaSalesRepository(prisma,tx)).post(org,actor,row.conversionKey,{...saved,payments:input.payments,occurredAt:now()});
      if(!result.ok)throw new DraftError(result.reason);
      const updated=await tx.saleDraft.update({where:{id},data:{status:'CONVERTED',saleId:result.sale.id,version:{increment:1}}});await audit(tx,org,actor,id,'DRAFT_CONVERTED');return document(updated,now());
    });}
  };
}
