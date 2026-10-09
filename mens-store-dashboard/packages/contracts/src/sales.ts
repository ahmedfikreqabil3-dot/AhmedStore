import { z } from 'zod';
import { decimalStringSchema } from './catalogue.js';

export const positiveDecimalStringSchema = decimalStringSchema.refine((value) => !/^0(?:\.0{1,4})?$/.test(value));

export const paymentMethodSchema = z.enum(['CASH', 'CARD', 'WALLET', 'INSTAPAY', 'CREDIT']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const saleLineInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: positiveDecimalStringSchema,
  unitPrice: decimalStringSchema,
  discount: decimalStringSchema
});
export type SaleLineInput = z.infer<typeof saleLineInputSchema>;

export const salePaymentInputSchema = z.object({
  method: paymentMethodSchema,
  amount: positiveDecimalStringSchema
});
export type SalePaymentInput = z.infer<typeof salePaymentInputSchema>;

export const createSaleSchema = z.object({
  customerId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  lines: z.array(saleLineInputSchema).min(1),
  payments: z.array(salePaymentInputSchema).min(1),
  occurredAt: z.coerce.date()
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const salesExportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  warehouseId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional()
}).refine((query) => !query.from || !query.to || query.from <= query.to, { message: 'from must be before to' });
export type SalesExportQuery = z.infer<typeof salesExportQuerySchema>;

export const invoiceReturnLineInputSchema = z.object({
  saleLineId: z.string().uuid(),
  quantity: positiveDecimalStringSchema
});
export type InvoiceReturnLineInput = z.infer<typeof invoiceReturnLineInputSchema>;

export const createInvoiceReturnSchema = z.object({
  saleId: z.string().uuid(),
  lines: z.array(invoiceReturnLineInputSchema).min(1),
  payments: z.array(salePaymentInputSchema).min(1),
  reason: z.string().trim().min(3).max(500),
  occurredAt: z.coerce.date()
});
export type CreateInvoiceReturnInput = z.infer<typeof createInvoiceReturnSchema>;

export const noInvoiceReturnLineInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: positiveDecimalStringSchema,
  unitPrice: decimalStringSchema
});
export type NoInvoiceReturnLineInput = z.infer<typeof noInvoiceReturnLineInputSchema>;

export const createNoInvoiceReturnSchema = z.object({
  customerId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  lines: z.array(noInvoiceReturnLineInputSchema).min(1),
  payments: z.array(salePaymentInputSchema).min(1),
  reason: z.string().trim().min(3).max(500),
  itemCondition: z.string().trim().min(2).max(300),
  occurredAt: z.coerce.date()
});
export type CreateNoInvoiceReturnInput = z.infer<typeof createNoInvoiceReturnSchema>;
