import {Prisma,type PrismaClient} from '@prisma/client';
import {masterChangeSchema,masterKindSchema,settingsSchema} from '@ahmed-store/contracts';
import {z} from 'zod';import {retryWriteConflict} from '../shared/retry-write-conflict.js';import {can} from '../identity/authorization.js';
export class ManagementError extends Error{constructor(message:string,readonly status=409){super(message);}}
type Kind=z.infer<typeof masterKindSchema>;type Change=z.infer<typeof masterChangeSchema>;
export function createManagementService(db:PrismaClient){
 const transaction=<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>)=>retryWriteConflict(()=>db.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
 const row=(x:{id:string;name:string;updatedAt:Date;active?:boolean;archivedAt?:Date|null})=>({id:x.id,name:x.name,version:x.updatedAt.toISOString(),active:x.active??x.archivedAt===null});
 async function actor(tx:Prisma.TransactionClient,org:string,id:string,admin=false){const u=await tx.user.findFirst({where:{organizationId:org,id,active:true}});if(!u||(admin?u.role!=='ADMIN':!can(u.role,'inventory:write')))throw new ManagementError('FORBIDDEN',403);}
 async function audit(tx:Prisma.TransactionClient,org:string,user:string,id:string,kind:string){await tx.auditEvent.create({data:{organizationId:org,actorUserId:user,entityType:kind,entityId:id,action:'MASTER_UPDATED'}});}
 return{
 async list(org:string,kind:Kind){const where={organizationId:org},orderBy={name:'asc' as const};return (kind==='products'?await db.product.findMany({where,orderBy}):kind==='warehouses'?await db.warehouse.findMany({where,orderBy}):await db.category.findMany({where,orderBy})).map(row);},
 async update(org:string,user:string,kind:Kind,id:string,input:Change){try{return await transaction(async tx=>{
 await actor(tx,org,user);if(kind!=='products'&&input.name.length>120)throw new ManagementError('INVALID_NAME',400);const where={organizationId:org,id};const current=kind==='products'?await tx.product.findFirst({where}):kind==='warehouses'?await tx.warehouse.findFirst({where}):await tx.category.findFirst({where});if(!current)throw new ManagementError('NOT_FOUND',404);if(current.updatedAt.toISOString()!==input.version)throw new ManagementError('RECORD_CHANGED');
 if(!input.active){
 if(kind==='categories'){if(await tx.product.count({where:{organizationId:org,categoryId:id,active:true}}))throw new ManagementError('CATEGORY_IN_USE');}
 else{
 const balances=await tx.inventoryTransaction.groupBy({by:['warehouseId','productId'],where:{organizationId:org,...(kind==='products'?{productId:id}:{warehouseId:id})},_sum:{quantity:true}});if(balances.some(b=>!b._sum.quantity?.isZero()))throw new ManagementError('STOCK_REMAINS');
 const drafts=await tx.saleDraft.findMany({where:{organizationId:org,status:'OPEN',...(kind==='warehouses'?{warehouseId:id}:{})},select:{lines:true}}),orders=await tx.purchaseOrder.findMany({where:{organizationId:org,status:{in:['OPEN','PARTIAL']},...(kind==='warehouses'?{warehouseId:id}:{})},select:{lines:true}});if([...drafts,...orders].some(d=>kind==='warehouses'||(d.lines as Array<{productId:string}>).some(l=>l.productId===id)))throw new ManagementError('OPEN_DOCUMENTS');
 }
 }else if(kind==='products'){
 const product=current as Prisma.ProductGetPayload<{}>;if(product.categoryId&&!await tx.category.findFirst({where:{id:product.categoryId,organizationId:org,archivedAt:null}}))throw new ManagementError('CATEGORY_UNAVAILABLE');
 }
 const timestamp=new Date(Math.max(Date.now(),current.updatedAt.getTime()+1)),data={name:input.name,updatedAt:timestamp};const changed=kind==='products'?await tx.product.update({where:{id},data:{...data,active:input.active,version:{increment:1}}}):kind==='warehouses'?await tx.warehouse.update({where:{id},data:{...data,active:input.active}}):await tx.category.update({where:{id},data:{...data,archivedAt:input.active?null:timestamp}});await audit(tx,org,user,id,kind);return row(changed);
 });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw new ManagementError('NAME_EXISTS');throw e;}},
 async settings(org:string){const x=await db.organization.findUniqueOrThrow({where:{id:org}});return settingsSchema.parse({phone:'',address:'',receiptFooter:'',...(x.settings as object),name:x.name,version:x.settingsVersion});},
 async saveSettings(org:string,user:string,input:z.infer<typeof settingsSchema>){return transaction(async tx=>{await actor(tx,org,user,true);const {name,version,...settings}=input;const n=await tx.organization.updateMany({where:{id:org,settingsVersion:version},data:{name,settings,settingsVersion:{increment:1}}});if(!n.count)throw new ManagementError('RECORD_CHANGED');await audit(tx,org,user,org,'Settings');return{...input,version:version+1};});}
 };
}
