import { z } from 'zod';

export const reportKindSchema = z.enum(['sales', 'purchases', 'inventory', 'expenses', 'treasury', 'customers', 'suppliers']);
export const reportQuerySchema = z.object({
  kind: reportKindSchema,
  from: z.coerce.date(),
  to: z.coerce.date(),
  warehouseId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict().refine(q => q.from <= q.to, { message: 'INVALID_PERIOD' })
  .refine(q => !q.warehouseId || ['sales', 'purchases', 'inventory'].includes(q.kind), { message: 'INVALID_BRANCH_FILTER' });
export type ReportQuery = z.infer<typeof reportQuerySchema>;
const amount = z.string().regex(/^-?\d+\.\d{4}$/);
export const reportSchema = z.object({
  kind: reportKindSchema, from: z.coerce.date(), to: z.coerce.date(),
  total: z.number().int().nonnegative(), totalAmount: amount.nullable(), totalQuantity: amount.nullable(),
  limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
  rows: z.array(z.object({ id: z.string(), occurredAt: z.coerce.date(), label: z.string(), reference: z.string(), amount: amount.nullable(), quantity: amount.nullable() }))
});
export type OperationalReport = z.infer<typeof reportSchema>;
