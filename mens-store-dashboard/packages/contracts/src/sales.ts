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
