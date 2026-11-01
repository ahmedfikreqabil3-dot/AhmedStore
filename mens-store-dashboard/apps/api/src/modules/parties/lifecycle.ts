import { Prisma,type PrismaClient } from '@prisma/client';
import type { PartyDirectoryQuery,PartyDirectoryResult,PartyLifecycleInput } from '@ahmed-store/contracts';
import { can } from '../identity/authorization.js';
import { customerDebt,ledgerUnits } from './customer-ledger.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
type Kind='customers'|'suppliers';
export function mayManageParty(role:Parameters<typeof can>[0],kind:Kind){return can(role,'inventory:write')&&can(role,kind==='customers'?'sales:write':'purchases:manage');}
export type PartyLifecycleResult={ok:true;party:{id:string;active:boolean;version:number}}|{ok:false;reason:'PARTY_NOT_FOUND'|'ACTOR_UNAVAILABLE'|'VERSION_CONFLICT'|'OPEN_BALANCE'|'PENDING_DOCUMENT'};
export function createPartyLifecycleService(prisma:PrismaClient){return {
  async directory(organizationId:string,kind:Kind,query:PartyDirectoryQuery):Promise<PartyDirectoryResult>{
    return prisma.$transaction(async tx=>{
      const where={organizationId,...(query.status==='all'?{}:{active:query.status==='active'})};
      const options={where,orderBy:[{name:'asc' as const},{id:'asc' as const}],take:query.limit,skip:query.offset};
      if(kind==='customers'){const [rows,total]=await Promise.all([tx.customer.findMany(options),tx.customer.count({where})]);return {kind,parties:rows.map(row=>({...row,creditLimit:row.creditLimit.toFixed(4)})),total,limit:query.limit,offset:query.offset};}
      const [parties,total]=await Promise.all([tx.supplier.findMany(options),tx.supplier.count({where})]);return {kind,parties,total,limit:query.limit,offset:query.offset};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  },
  async change(organizationId:string,actorUserId:string,kind:Kind,id:string,input:PartyLifecycleInput):Promise<PartyLifecycleResult>{
    return retryWriteConflict(()=>prisma.$transaction(async tx=>{
      const actor=await tx.user.findFirst({where:{organizationId,id:actorUserId,active:true},select:{role:true}});
      if(!actor||!mayManageParty(actor.role,kind))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
      const where={id,organizationId};
      const party=kind==='customers'?await tx.customer.findFirst({where}):await tx.supplier.findFirst({where});
      if(!party)return {ok:false as const,reason:'PARTY_NOT_FOUND' as const};
      if(party.version!==input.version)return {ok:false as const,reason:'VERSION_CONFLICT' as const};
      if(party.active===input.active)return {ok:true as const,party:{id,active:party.active,version:party.version}};
      if(!input.active){
        let balance=0n;
        if(kind==='customers'){
          balance=await customerDebt(tx,organizationId,id);
          const pending=await tx.salesReturn.count({where:{organizationId,customerId:id,status:'PENDING_APPROVAL'}});
          if(pending>0)return {ok:false as const,reason:'PENDING_DOCUMENT' as const};
        }else{
          const groups=await tx.supplierLedgerEntry.groupBy({by:['type'],where:{organizationId,supplierId:id},_sum:{amount:true}});
          for(const group of groups){const amount=ledgerUnits(group._sum.amount!.toFixed(4));balance+=group.type==='PURCHASE_CREDIT'?amount:-amount;}
        }
        if(balance!==0n)return {ok:false as const,reason:'OPEN_BALANCE' as const};
      }
      const update={where:{...where,version:input.version},data:{active:input.active,version:{increment:1}}};
      const changed=kind==='customers'?await tx.customer.updateMany(update):await tx.supplier.updateMany(update);
      if(changed.count!==1)return {ok:false as const,reason:'VERSION_CONFLICT' as const};
      await tx.auditEvent.create({data:{organizationId,actorUserId,action:`${kind==='customers'?'CUSTOMER':'SUPPLIER'}_${input.active?'REACTIVATED':'ARCHIVED'}`,entityType:kind==='customers'?'Customer':'Supplier',entityId:id,details:{reason:input.reason,previousActive:party.active,active:input.active,version:input.version+1}}});
      return {ok:true as const,party:{id,active:input.active,version:input.version+1}};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
  }
};}
