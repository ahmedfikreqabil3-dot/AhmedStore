import {randomUUID,createHash} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {purchaseOrderSchema,type OrderInput,type ReceiptInput} from '@ahmed-store/contracts';
import {calculatePurchase} from './calculation.js';
import {createPurchaseService} from './service.js';
import {createPrismaPurchaseRepository} from './prisma-repository.js';
import {retryWriteConflict} from '../shared/retry-write-conflict.js';
import {can} from '../identity/authorization.js';
type Line={id:string;productId:string;productName:string;sku:string;quantity:string;unitCost:string};
type Received={lineId:string;quantity:string};
export class OrderError extends Error{constructor(message:string,readonly status=409){super(message);}}
export function createPurchaseOrderService(db:PrismaClient){
  const write=<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>)=>retryWriteConflict(()=>db.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
  async function actor(tx:Prisma.TransactionClient,org:string,id:string){const user=await tx.user.findFirst({where:{id,organizationId:org,active:true}});if(!user||!can(user.role,'purchases:manage'))throw new OrderError('FORBIDDEN',403);}
  async function read(tx:Prisma.TransactionClient,org:string,id:string){const row=await tx.purchaseOrder.findFirst({where:{id,organizationId:org},include:{receipts:{orderBy:{createdAt:'asc'}}}});if(!row)throw new OrderError('ORDER_NOT_FOUND',404);const quantities=new Map<string,Prisma.Decimal>();for(const receipt of row.receipts)for(const line of receipt.lines as Received[])quantities.set(line.lineId,(quantities.get(line.lineId)??new Prisma.Decimal(0)).plus(line.quantity));return purchaseOrderSchema.parse({...row,total:row.total.toFixed(4),lines:(row.lines as Line[]).map(line=>({...line,received:(quantities.get(line.id)??new Prisma.Decimal(0)).toFixed(4)})),receipts:row.receipts.map(r=>({...r,total:r.total.toFixed(4)}))});}
  async function lock(tx:Prisma.TransactionClient,org:string,id:string){await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id=${id} AND "organizationId"=${org} FOR UPDATE`;return read(tx,org,id);}
  async function audit(tx:Prisma.TransactionClient,org:string,user:string,id:string,action:string){await tx.auditEvent.create({data:{organizationId:org,actorUserId:user,entityId:id,entityType:'PurchaseOrder',action}});}
  return{
    read:(org:string,id:string)=>db.$transaction(tx=>read(tx,org,id),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead}),
    async list(org:string,offset=0){return db.$transaction(async tx=>{const where={organizationId:org},rows=await tx.purchaseOrder.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:offset,take:25});const items=[];for(const row of rows)items.push(await read(tx,org,row.id));return{items,total:await tx.purchaseOrder.count({where}),limit:25,offset};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});},
    async create(org:string,user:string,key:string,input:OrderInput){const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');return write(async tx=>{
      await actor(tx,org,user);const prior=await tx.purchaseOrder.findUnique({where:{organizationId_idempotencyKey:{organizationId:org,idempotencyKey:key}}});if(prior){if(prior.actorUserId!==user||prior.requestHash!==hash)throw new OrderError('IDEMPOTENCY_KEY_CONFLICT');return read(tx,org,prior.id);}
      const supplier=await tx.supplier.findFirst({where:{id:input.supplierId,organizationId:org,active:true}}),warehouse=await tx.warehouse.findFirst({where:{id:input.warehouseId,organizationId:org,active:true}}),ids=[...new Set(input.lines.map(l=>l.productId))],products=await tx.product.findMany({where:{organizationId:org,id:{in:ids},active:true}});
      if(!supplier||!warehouse||products.length!==ids.length)throw new OrderError('MASTER_UNAVAILABLE');const total=calculatePurchase(input.lines).total;if(new Prisma.Decimal(total).lte(0))throw new OrderError('INVALID_TOTAL',400);
      const byId=new Map(products.map(p=>[p.id,p])),row=await tx.purchaseOrder.create({data:{organizationId:org,actorUserId:user,supplierId:supplier.id,warehouseId:warehouse.id,supplierName:supplier.name,warehouseName:warehouse.name,total,idempotencyKey:key,requestHash:hash,lines:input.lines.map(line=>({...line,id:randomUUID(),productName:byId.get(line.productId)!.name,sku:byId.get(line.productId)!.sku}))}});await audit(tx,org,user,row.id,'ORDER_CREATED');return read(tx,org,row.id);
    });},
    async cancel(org:string,user:string,id:string,version:number){return write(async tx=>{await actor(tx,org,user);const order=await lock(tx,org,id);if(order.status==='CANCELLED')return order;if(order.status==='RECEIVED'||order.version!==version)throw new OrderError('ORDER_CHANGED');await tx.purchaseOrder.update({where:{id},data:{status:'CANCELLED',version:{increment:1}}});await audit(tx,org,user,id,'ORDER_CANCELLED');return read(tx,org,id);});},
    async receive(org:string,user:string,id:string,key:string,input:ReceiptInput){const hash=createHash('sha256').update(JSON.stringify({id,...input})).digest('hex');return write(async tx=>{
      await actor(tx,org,user);const order=await lock(tx,org,id),prior=await tx.orderReceipt.findUnique({where:{organizationId_idempotencyKey:{organizationId:org,idempotencyKey:key}}});
      if(prior){if(prior.orderId!==id||prior.requestHash!==hash)throw new OrderError('IDEMPOTENCY_KEY_CONFLICT');return order;}
      if(!['OPEN','PARTIAL'].includes(order.status)||order.version!==input.version)throw new OrderError('ORDER_CHANGED');if(new Set(input.lines.map(l=>l.lineId)).size!==input.lines.length)throw new OrderError('DUPLICATE_LINE',400);
      const lines=input.lines.map(line=>{const original=order.lines.find(l=>l.id===line.lineId);if(!original||new Prisma.Decimal(line.quantity).gt(new Prisma.Decimal(original.quantity).minus(original.received)))throw new OrderError('OVER_RECEIPT');return{productId:original.productId,unitCost:original.unitCost,quantity:line.quantity};});
      const result=await createPurchaseService(createPrismaPurchaseRepository(db,tx)).post(org,user,randomUUID(),{supplierId:order.supplierId,warehouseId:order.warehouseId,lines,payments:input.payments,occurredAt:new Date()});if(!result.ok)throw new OrderError(result.reason);
      await tx.orderReceipt.create({data:{organizationId:org,orderId:id,purchaseId:result.purchase.id,total:result.purchase.total,lines:input.lines,idempotencyKey:key,requestHash:hash}});
      const complete=order.lines.every(l=>new Prisma.Decimal(l.received).plus(input.lines.find(r=>r.lineId===l.id)?.quantity??'0').eq(l.quantity));await tx.purchaseOrder.update({where:{id},data:{status:complete?'RECEIVED':'PARTIAL',version:{increment:1}}});await audit(tx,org,user,id,'ORDER_RECEIVED');return read(tx,org,id);
    });}
  };
}
