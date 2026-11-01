import { Prisma, type PrismaClient } from '@prisma/client';
import { expect, it, vi } from 'vitest';
import { createPartyUpdateService, createPrismaPartyUpdateRepository, type PartyUpdateTransaction } from '../../../src/modules/parties/update.js';
const id='63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const input={name:'Updated party',phone:null,email:null,address:null,notes:null,version:1};
const supplier={...input,id,organizationId:id,active:true};
const customer={...supplier,legacyId:null,creditLimit:'10.1234'};
const customerInput={...input,creditLimit:'10.1234'};
function setup(overrides:Partial<PartyUpdateTransaction>={}){
  const tx:PartyUpdateTransaction={customer:vi.fn(async()=>customer),supplier:vi.fn(async()=>supplier),updateCustomer:vi.fn(async()=>({...customer,version:2})),updateSupplier:vi.fn(async()=>({...supplier,version:2})),audit:vi.fn(async()=>{}),...overrides};
  return {tx,service:createPartyUpdateService({transaction:async work=>work(tx)})};
}
it('updates and audits customer/supplier profiles with organization, actor and optimistic version checks',async()=>{
  const {tx,service}=setup();expect(await service.customer(id,'actor',id,customerInput)).toEqual({ok:true,party:{...customer,version:2}});
  expect(await service.supplier(id,'actor',id,input)).toEqual({ok:true,party:{...supplier,version:2}});
  expect(tx.updateCustomer).toHaveBeenCalledWith(id,id,customerInput);expect(tx.updateSupplier).toHaveBeenCalledWith(id,id,input);
  expect(tx.audit).toHaveBeenCalledWith('customer',id,'actor',id);expect(tx.audit).toHaveBeenCalledWith('supplier',id,'actor',id);
});
it('does not update/audit missing or stale records and handles a version race at the write',async()=>{
  for(const kind of ['customer','supplier'] as const){
    for(const [read,reason] of [[null,'PARTY_NOT_FOUND'],[{...customer,version:2},'VERSION_CONFLICT']] as const){
      const {service,tx}=setup({[kind]:async()=>read});
      expect(await service[kind](id,'actor',id,customerInput)).toEqual({ok:false,reason});expect(tx.audit).not.toHaveBeenCalled();
    }
  }
  const {service}=setup({updateCustomer:async()=>null,updateSupplier:async()=>null});
  expect(await service.customer(id,'actor',id,customerInput)).toEqual({ok:false,reason:'VERSION_CONFLICT'});
  expect(await service.supplier(id,'actor',id,input)).toEqual({ok:false,reason:'VERSION_CONFLICT'});
});
it('maps duplicate/serializable races while propagating unrelated errors for transaction rollback',async()=>{
  for(const [code,reason] of [['P2002','PARTY_EXISTS'],['P2034','VERSION_CONFLICT']]){
    const error=new Prisma.PrismaClientKnownRequestError('database',{code:code!,clientVersion:'test'});
    const service=createPartyUpdateService({transaction:async()=>{throw error;}});expect(await service.customer(id,'actor',id,customerInput)).toEqual({ok:false,reason});
  }
  for(const error of [new Prisma.PrismaClientKnownRequestError('database',{code:'P2003',clientVersion:'test'}),Error('audit unavailable')]){
    const service=createPartyUpdateService({transaction:async()=>{throw error;}});await expect(service.supplier(id,'actor',id,input)).rejects.toBe(error);
  }
});
it('uses serializable, scoped compare-and-swap writes with exact customer credit and atomic audit',async()=>{
  const record={...customer,creditLimit:new Prisma.Decimal('10.1234')};
  const tx={customer:{findFirst:vi.fn(async()=>record),updateMany:vi.fn(async()=>({count:1}))},supplier:{findFirst:vi.fn(async()=>supplier),updateMany:vi.fn(async()=>({count:1}))},auditEvent:{create:vi.fn(async()=>({}))}};
  const transaction=vi.fn(async(work:(value:typeof tx)=>Promise<unknown>)=>work(tx));
  const repository=createPrismaPartyUpdateRepository({$transaction:transaction} as unknown as PrismaClient);
  await repository.transaction(async port=>{
    expect(await port.customer(id,id)).toEqual(customer);expect(await port.supplier(id,id)).toEqual(supplier);
    expect(await port.updateCustomer(id,id,customerInput)).toEqual(customer);expect(await port.updateSupplier(id,id,input)).toEqual(supplier);
    await port.audit('customer',id,'actor',id);await port.audit('supplier',id,'actor',id);
    tx.customer.findFirst.mockResolvedValueOnce(null as never);expect(await port.customer(id,id)).toBeNull();
    tx.customer.updateMany.mockResolvedValueOnce({count:0});expect(await port.updateCustomer(id,id,customerInput)).toBeNull();
    tx.supplier.updateMany.mockResolvedValueOnce({count:0});expect(await port.updateSupplier(id,id,input)).toBeNull();
  });
  expect(tx.customer.updateMany).toHaveBeenCalledWith({where:{id,organizationId:id,version:1},data:{name:input.name,phone:null,email:null,address:null,notes:null,creditLimit:'10.1234',version:{increment:1}}});
  expect(tx.supplier.findFirst).toHaveBeenCalledWith({where:{id,organizationId:id}});
  expect(tx.auditEvent.create).toHaveBeenCalledWith({data:{organizationId:id,actorUserId:'actor',entityId:id,entityType:'Customer',action:'CUSTOMER_UPDATED'}});
  expect(transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});
});
