import {expect,it} from 'vitest';
import {createTreasuryAccountSchema,treasuryTransferSchema,settlementSchema,treasuryCommandSchema,settlementPartyQuerySchema} from '../src/treasury.js';
const a='25a0aad8-edb0-4091-ad94-4d5a6d5a6d50',b='25a0aad8-edb0-4091-ad94-4d5a6d5a6d51',reason='Opening actual cash';
it('validates bounded noncredit treasury accounts and reserves migration default names',()=>{
  expect(createTreasuryAccountSchema.parse({name:'Cash desk',paymentMethod:'CASH',reason})).toHaveProperty('openingBalance','0');
  for(const patch of [{name:'الخزينة الافتراضية - CASH'},{paymentMethod:'CREDIT'},{openingBalance:'-1'},{openingBalance:'1.00001'},{openingBalance:'1000000000000000'},{reason:'x'},{organizationId:a}])expect(createTreasuryAccountSchema.safeParse({name:'Cash desk',paymentMethod:'CASH',reason,...patch}).success).toBe(false);
});
it('rejects same-account transfers, nonpositive money, duplicate invoices and uncontrolled command shapes',()=>{
  const transfer={fromAccountId:a,toAccountId:b,amount:'0.0001',reason};expect(treasuryTransferSchema.parse(transfer)).toEqual(transfer);
  for(const patch of [{toAccountId:a},{amount:'00'},{amount:'0.0000'},{amount:'-1'},{amount:'1.12345'}])expect(treasuryTransferSchema.safeParse({...transfer,...patch}).success).toBe(false);
  const input={kind:'customers',partyId:a,accountId:b,amount:'1.1234',reason};expect(settlementSchema.parse(input)).toHaveProperty('allocations',[]);
  expect(settlementSchema.safeParse({...input,allocations:[{documentId:a,amount:'1'},{documentId:a,amount:'1'}]}).success).toBe(false);
  expect(treasuryCommandSchema.parse({operation:'settlement',input})).toHaveProperty('operation','settlement');expect(settlementPartyQuerySchema.parse({kind:'suppliers'})).toHaveProperty('search','');
});
