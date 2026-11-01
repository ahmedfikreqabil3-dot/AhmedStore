import { z } from 'zod';

export const partyStatementQuerySchema = z.object({
  from: z.coerce.date(), to: z.coerce.date(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict().refine(query => query.from <= query.to, { message: 'INVALID_PERIOD' });
export type PartyStatementQuery = z.infer<typeof partyStatementQuerySchema>;
const amount = z.string().regex(/^-?\d+\.\d{4}$/);
export const partyStatementSchema = z.object({
  kind: z.enum(['customers', 'suppliers']),
  party: z.object({ id: z.string().uuid(), name: z.string(), active: z.boolean() }),
  from: z.coerce.date(), to: z.coerce.date(),
  opening: amount, debits: amount, credits: amount, closing: amount,
  total: z.number().int().nonnegative(), limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
  rows: z.array(z.object({ id: z.string(), occurredAt: z.coerce.date(), type: z.string(), sourceType: z.string(), sourceId: z.string(), amount, balance: amount }))
});
export type PartyStatement = z.infer<typeof partyStatementSchema>;
