import {expect,it} from 'vitest';
import {saleDocumentSchema,invoiceReturnCommandSchema} from '../src/sale-document.js';
it('requires exact document money and validates frozen return command identifiers',()=>{
  expect(saleDocumentSchema.shape.total.safeParse('39.9000').success).toBe(true);for(const value of [39.9,'39.9','-1.0000'])expect(saleDocumentSchema.shape.total.safeParse(value).success).toBe(false);
  const id='33333333-3333-4333-8333-333333333333',command={input:{saleId:id,lines:[{saleLineId:id,quantity:'0.25'}],payments:[{method:'CASH',amount:'4.9875'}],reason:'Reviewed return',occurredAt:'2026-11-01T00:00:00Z'}};
  expect(invoiceReturnCommandSchema.parse(command).input.occurredAt).toBeInstanceOf(Date);expect(invoiceReturnCommandSchema.safeParse({...command,returnId:'invalid'}).success).toBe(false);expect(invoiceReturnCommandSchema.safeParse({...command,organizationId:id}).success).toBe(false);
});
