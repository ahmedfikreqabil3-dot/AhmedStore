import { Prisma, type PrismaClient } from '@prisma/client';
import type { Customer, Supplier, UpdateCustomerInput, UpdateSupplierInput } from '@ahmed-store/contracts';

type Kind='customer'|'supplier';
export type PartyUpdateResult<T>={ok:true;party:T}|{ok:false;reason:'PARTY_NOT_FOUND'|'VERSION_CONFLICT'|'PARTY_EXISTS'};
export interface PartyUpdateTransaction {
  customer(organizationId:string,id:string):Promise<Customer|null>;
  supplier(organizationId:string,id:string):Promise<Supplier|null>;
  updateCustomer(organizationId:string,id:string,input:UpdateCustomerInput):Promise<Customer|null>;
  updateSupplier(organizationId:string,id:string,input:UpdateSupplierInput):Promise<Supplier|null>;
  audit(kind:Kind,organizationId:string,actorUserId:string,id:string):Promise<void>;
}
export interface PartyUpdateRepository {transaction<T>(work:(transaction:PartyUpdateTransaction)=>Promise<T>):Promise<T>;}
export function createPartyUpdateService(repository:PartyUpdateRepository){
  async function update<T extends Customer|Supplier>(kind:Kind,organizationId:string,actorUserId:string,id:string,input:UpdateCustomerInput|UpdateSupplierInput):Promise<PartyUpdateResult<T>>{
    try{return await repository.transaction(async tx=>{
      const current=kind==='customer' ? await tx.customer(organizationId,id) : await tx.supplier(organizationId,id);
      if(!current)return {ok:false,reason:'PARTY_NOT_FOUND'};
      if(current.version!==input.version)return {ok:false,reason:'VERSION_CONFLICT'};
      const party=kind==='customer' ? await tx.updateCustomer(organizationId,id,input as UpdateCustomerInput) : await tx.updateSupplier(organizationId,id,input);
      if(!party)return {ok:false,reason:'VERSION_CONFLICT'};
      await tx.audit(kind,organizationId,actorUserId,id);return {ok:true,party:party as T};
    });}catch(error){
      if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002')return {ok:false,reason:'PARTY_EXISTS'};
      if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2034')return {ok:false,reason:'VERSION_CONFLICT'};
      throw error;
    }
  }
  return {
    customer:(organizationId:string,actorUserId:string,id:string,input:UpdateCustomerInput)=>update<Customer>('customer',organizationId,actorUserId,id,input),
    supplier:(organizationId:string,actorUserId:string,id:string,input:UpdateSupplierInput)=>update<Supplier>('supplier',organizationId,actorUserId,id,input)
  };
}
export function createPrismaPartyUpdateRepository(prisma:PrismaClient):PartyUpdateRepository{
  return {transaction:work=>prisma.$transaction(async tx=>{
    const customer=async(organizationId:string,id:string)=>{const value=await tx.customer.findFirst({where:{id,organizationId}});return value && {...value,creditLimit:value.creditLimit.toFixed(4)};};
    const supplier=async(organizationId:string,id:string)=>tx.supplier.findFirst({where:{id,organizationId}});
    return work({customer,supplier,
      async updateCustomer(organizationId,id,input){const {version,...fields}=input;const result=await tx.customer.updateMany({where:{id,organizationId,version},data:{...fields,version:{increment:1}}});return result.count ? customer(organizationId,id) : null;},
      async updateSupplier(organizationId,id,input){const {version,...fields}=input;const result=await tx.supplier.updateMany({where:{id,organizationId,version},data:{...fields,version:{increment:1}}});return result.count ? supplier(organizationId,id) : null;},
      async audit(kind,organizationId,actorUserId,id){await tx.auditEvent.create({data:{organizationId,actorUserId,entityId:id,entityType:kind==='customer' ? 'Customer' : 'Supplier',action:kind==='customer' ? 'CUSTOMER_UPDATED' : 'SUPPLIER_UPDATED'}});}
    });
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})};
}
