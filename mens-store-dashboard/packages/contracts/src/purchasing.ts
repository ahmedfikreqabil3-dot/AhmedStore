import { z } from 'zod';
import { decimalStringSchema } from './catalogue.js';
import { paymentMethodSchema } from './sales.js';

export const positivePurchaseDecimalSchema = decimalStringSchema.refine((value) => !/^0(?:\.0{1,4})?$/.test(value));

export const purchaseLineInputSchema = z.object({
  productId: z.string().uuid().optional(),
  barcode: z.string().trim().min(1).max(128).optional(),
  quantity: positivePurchaseDecimalSchema,
  unitCost: decimalStringSchema
}).superRefine((line, context) => {
  if ((line.productId ? 1 : 0) + (line.barcode ? 1 : 0) !== 1) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide exactly one productId or barcode.' });
});
export type PurchaseLineInput = z.infer<typeof purchaseLineInputSchema>;

export const purchasePaymentInputSchema = z.object({
  method: paymentMethodSchema,
  amount: positivePurchaseDecimalSchema
});
export type PurchasePaymentInput = z.infer<typeof purchasePaymentInputSchema>;

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  lines: z.array(purchaseLineInputSchema).min(1),
  payments: z.array(purchasePaymentInputSchema).min(1),
  occurredAt: z.coerce.date()
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const purchaseReturnLineInputSchema = z.object({ purchaseLineId: z.string().uuid(), quantity: positivePurchaseDecimalSchema });
export const purchaseReturnSettlementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SUPPLIER_CREDIT') }),
  z.object({ kind: z.literal('TREASURY_REFUND'), paymentMethod: paymentMethodSchema.exclude(['CREDIT']) })
]);
export const createPurchaseReturnSchema = z.object({ purchaseId: z.string().uuid(), lines: z.array(purchaseReturnLineInputSchema).min(1), reason: z.string().trim().min(3).max(500), settlement: purchaseReturnSettlementSchema, occurredAt: z.coerce.date() });
export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;
