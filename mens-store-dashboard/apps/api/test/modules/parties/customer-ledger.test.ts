import { Prisma } from '@prisma/client';
import { expect, it } from 'vitest';
import { creditUnits, ledgerDecimal, ledgerUnits } from '../../../src/modules/parties/customer-ledger.js';

it('retains the exact sign and precision of accumulated customer balances beyond Decimal arithmetic precision',()=>{
  for(const value of ['0.0000','19.9500','-2.9875','999999999999999999.9999','-999999999999999999.9999'])expect(ledgerDecimal(ledgerUnits(value))).toBe(value);
  expect(ledgerUnits('12')).toBe(120000n);
  expect(creditUnits([{method:'CREDIT',amount:'999999999999999.9999'},{method:'CREDIT',amount:new Prisma.Decimal('0.0001')},{method:'CASH',amount:'10'}])).toBe(10000000000000000000n);
});
