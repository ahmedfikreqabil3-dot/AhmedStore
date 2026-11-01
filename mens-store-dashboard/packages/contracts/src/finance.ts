import { z } from 'zod';
import { decimalStringSchema } from './catalogue.js';
import { paymentMethodSchema } from './sales.js';
import { partyStatementQuerySchema } from './party-statement.js';

export const createExpenseSchema = z.object({
  category: z.string().trim().min(2).max(120),
  description: z.string().trim().min(3).max(500),
  paymentMethod: paymentMethodSchema.exclude(['CREDIT']),
  amount: decimalStringSchema.refine((value) => !/^0+(?:\.0+)?$/.test(value)),
  occurredAt: z.coerce.date()
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export const expenseHistoryQuerySchema = partyStatementQuerySchema;
export type ExpenseHistoryQuery = z.infer<typeof expenseHistoryQuerySchema>;
export const expenseRecordSchema = createExpenseSchema.extend({id:z.string().uuid(),organizationId:z.string().uuid()});
export const expenseHistorySchema = z.object({
  expenses:z.array(expenseRecordSchema), total:z.number().int().nonnegative(),
  totalAmount:z.string().regex(/^\d+\.\d{4}$/), limit:z.number().int().positive(),offset:z.number().int().nonnegative()
});
export type ExpenseHistory = z.infer<typeof expenseHistorySchema>;
