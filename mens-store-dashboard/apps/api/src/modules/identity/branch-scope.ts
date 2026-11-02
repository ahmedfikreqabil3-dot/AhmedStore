import {AsyncLocalStorage} from 'node:async_hooks';import {Prisma,type PrismaClient} from '@prisma/client';import type {SessionResult} from './session.js';
export const branchContext=new AsyncLocalStorage<{warehouseIds?:string[];auth?:SessionResult}>();
export class BranchAccessError extends Error{statusCode=403;constructor(){super('BRANCH_FORBIDDEN');}}
export function branchPredicate(column='"warehouseId"'){const ids=branchContext.getStore()?.warehouseIds;return ids===undefined?Prisma.empty:ids.length?Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(ids)})`:Prisma.sql`AND false`;}
export function createBranchScopedClient(db:PrismaClient):PrismaClient{
 const direct=new Set(['Sale','Purchase','SalesReturn','PurchaseReturn','SaleDraft','PurchaseOrder','InventoryTransaction','StockCount','StockThreshold']);
 const parent:Record<string,string>={SaleLine:'sale',SalePayment:'sale',PurchaseLine:'purchase',PurchasePayment:'purchase',ReturnLine:'salesReturn',ReturnPayment:'salesReturn',PurchaseReturnLine:'purchaseReturn',PurchaseReturnPayment:'purchaseReturn',PurchaseReturnSettlement:'purchaseReturn',OrderReceipt:'order',StockCountLine:'stockCount'};
 return db.$extends({query:{$allModels:{$allOperations({model,operation,args,query}){
 const ids=branchContext.getStore()?.warehouseIds;if(ids===undefined)return query(args);const filter=model==='Warehouse'?{id:{in:ids}}:direct.has(model)?{warehouseId:{in:ids}}:model==='InventoryTransfer'?{sourceWarehouseId:{in:ids},destinationWarehouseId:{in:ids}}:parent[model]?{[parent[model]!]:{warehouseId:{in:ids}}}:null;if(!filter)return query(args);
 const a=args as unknown as {where?:Record<string,unknown>;data?:unknown};if(['findMany','findFirst','findFirstOrThrow','findUnique','findUniqueOrThrow','count','aggregate','groupBy','update','updateMany','delete','deleteMany','upsert'].includes(operation))a.where={...a.where,AND:[...(a.where?.AND===undefined?[]:Array.isArray(a.where.AND)?a.where.AND:[a.where.AND]),filter]};
 if(['create','createMany','update','updateMany','upsert'].includes(operation))for(const d of (Array.isArray(a.data)?a.data:[a.data])){if(!d||typeof d!=='object')continue;const data=d as Record<string,unknown>;for(const key of ['warehouseId','sourceWarehouseId','destinationWarehouseId'])if(key in data&&(typeof data[key]!=='string'||!ids.includes(data[key] as string)))throw new BranchAccessError();if(model==='Warehouse'&&operation.startsWith('create'))throw new BranchAccessError();}
 return query(args);
 }}}}) as unknown as PrismaClient;
}
export function branchRequestAllowed(path:string,method:string,query:Record<string,unknown>,body:unknown,ids:string[]){
 if(/\/(treasury|expenses|shifts|user-administration|users|settings|management)(\/|$)/.test(path)||/\/(statement|directory)(\/|$)/.test(path))return false;
 if(method!=='GET'&&/^\/api\/v1\/(warehouses|products|categories|customers|suppliers)(\/|$)/.test(path))return false;
 if(path.includes('/reports/operations')&&!['sales','purchases','inventory'].includes(String(query.kind)))return false;
 const valid=(x:unknown):boolean=>!x||typeof x!=='object'||Object.entries(x).every(([key,value])=>/^(warehouseId|branchId|sourceWarehouseId|destinationWarehouseId)$/.test(key)?typeof value==='string'&&ids.includes(value):Array.isArray(value)?value.every(valid):valid(value));
 return valid(query)&&valid(body);
}
