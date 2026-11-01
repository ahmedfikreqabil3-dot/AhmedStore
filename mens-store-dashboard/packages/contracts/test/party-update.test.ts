import { expect, it } from 'vitest';
import { updateCustomerSchema, updateSupplierSchema } from '../src/party.js';
const base={name:'Party',phone:null,email:null,address:null,notes:null,version:1};
it('accepts complete versioned profiles and rejects owner/status/financial changes outside the schema',()=>{
  expect(updateSupplierSchema.parse(base)).toEqual(base);
  expect(updateCustomerSchema.parse({...base,creditLimit:'19.9500'}).creditLimit).toBe('19.9500');
  for(const extra of [{active:false},{organizationId:'other'},{version:0},{version:undefined},{balance:'2'}]){
    expect(updateSupplierSchema.safeParse({...base,...extra}).success).toBe(false);
    expect(updateCustomerSchema.safeParse({...base,creditLimit:'0',...extra}).success).toBe(false);
  }
  expect(updateCustomerSchema.safeParse({...base,creditLimit:'-1'}).success).toBe(false);
  expect(updateSupplierSchema.safeParse({...base,creditLimit:'2'}).success).toBe(false);
});
