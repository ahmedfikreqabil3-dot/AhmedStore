import { expect,it } from 'vitest';
import { createExpenseSchema,expenseHistoryQuerySchema } from '../src/finance.js';
it('requires a genuinely positive expense and rejects disguised zero amounts and credit payment',()=>{
  const input={category:'Utilities',description:'Electricity',paymentMethod:'CASH',amount:'0.0001',occurredAt:'2026-10-01'};
  expect(createExpenseSchema.parse(input)).toMatchObject({amount:'0.0001'});
  for(const amount of ['0','00','000.0000','-1','0.00001'])expect(createExpenseSchema.safeParse({...input,amount}).success).toBe(false);
  expect(createExpenseSchema.safeParse({...input,paymentMethod:'CREDIT'}).success).toBe(false);
  expect(expenseHistoryQuerySchema.safeParse({from:'2026-10-30',to:'2026-10-01'}).success).toBe(false);
});
