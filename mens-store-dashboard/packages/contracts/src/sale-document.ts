import { z } from 'zod';
import { createInvoiceReturnSchema, paymentMethodSchema } from './sales.js';
const amount=z.string().regex(/^\d+\.\d{4}$/);
export const saleDocumentSchema=z.object({
  id:z.string().uuid(),organizationName:z.string(),status:z.enum(['POSTED','VOIDED']),occurredAt:z.coerce.date(),
  customer:z.object({id:z.string().uuid(),name:z.string(),phone:z.string().nullable()}),warehouse:z.object({id:z.string().uuid(),name:z.string()}),
  subtotal:amount,discount:amount,total:amount,
  lines:z.array(z.object({id:z.string().uuid(),lineNumber:z.number().int(),productName:z.string(),sku:z.string(),quantity:amount,unitPrice:amount,discount:amount,total:amount,returnedQuantity:amount})),
  payments:z.array(z.object({method:paymentMethodSchema,amount})),
  returns:z.array(z.object({id:z.string().uuid(),status:z.enum(['POSTED','VOIDED','PENDING_APPROVAL']),replacesReturnId:z.string().uuid().nullable(),reason:z.string(),total:amount,occurredAt:z.coerce.date(),lines:z.array(z.object({saleLineId:z.string().uuid(),quantity:amount,unitPrice:amount,total:amount})),payments:z.array(z.object({method:paymentMethodSchema,amount}))}))
});
export type SaleDocument=z.infer<typeof saleDocumentSchema>;
export const saleHistoryPageSchema=z.object({sales:z.array(z.object({id:z.string().uuid(),customerName:z.string(),warehouseName:z.string(),total:amount,status:z.enum(['POSTED','VOIDED']),occurredAt:z.coerce.date()})),total:z.number().int().nonnegative(),limit:z.number().int().positive(),offset:z.number().int().nonnegative()});
export type SaleHistoryPage=z.infer<typeof saleHistoryPageSchema>;
export const invoiceReturnCommandSchema=z.object({returnId:z.string().uuid().optional(),input:createInvoiceReturnSchema}).strict();
export type InvoiceReturnCommand=z.infer<typeof invoiceReturnCommandSchema>;
