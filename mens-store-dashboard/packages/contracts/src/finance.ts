import { z } from 'zod';
import { decimalStringSchema } from './catalogue.js';
import { paymentMethodSchema } from './sales.js';

export const createExpenseSchema = z.object({
  category: z.string().trim().min(2).max(120),
  description: z.string().trim().min(3).max(500),
  paymentMethod: paymentMethodSchema.exclude(['CREDIT']),
  amount: decimalStringSchema.refine((value) => !/^0(?:\.0{1,4})?$/.test(value)),
  occurredAt: z.coerce.date()
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
