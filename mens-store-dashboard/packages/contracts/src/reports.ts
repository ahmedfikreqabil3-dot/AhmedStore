import { z } from 'zod';

export const reportKindSchema = z.enum(['sales', 'purchases', 'inventory', 'expenses', 'treasury', 'customers', 'suppliers']);
export const reportQuerySchema = z.object({
  kind: reportKindSchema,
  from: z.coerce.date(),
  to: z.coerce.date(),
  warehouseId: z.string().uuid().optional(),
  customerId:z.string().uuid().optional(),supplierId:z.string().uuid().optional(),productId:z.string().uuid().optional(),categoryId:z.string().uuid().optional(),accountId:z.string().uuid().optional(),
  paymentMethod:z.enum(['CASH','CARD','WALLET','INSTAPAY','CREDIT']).optional(),direction:z.enum(['IN','OUT']).optional(),search:z.string().trim().max(100).optional(),
  minAmount:z.string().regex(/^-?\d{1,15}(?:\.\d{1,4})?$/).optional(),maxAmount:z.string().regex(/^-?\d{1,15}(?:\.\d{1,4})?$/).optional(),
  minQuantity:z.string().regex(/^-?\d{1,15}(?:\.\d{1,4})?$/).optional(),maxQuantity:z.string().regex(/^-?\d{1,15}(?:\.\d{1,4})?$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict().refine(q => q.from <= q.to, { message: 'INVALID_PERIOD' })
  .refine(q => !q.warehouseId || ['sales', 'purchases', 'inventory'].includes(q.kind), { message: 'INVALID_BRANCH_FILTER' })
  .refine(q=>(!q.customerId||['sales','customers'].includes(q.kind))&&(!q.supplierId||['purchases','suppliers'].includes(q.kind))&&(!(q.productId||q.categoryId)||['sales','purchases','inventory'].includes(q.kind))&&(!q.accountId||['treasury','expenses'].includes(q.kind))&&(!q.paymentMethod||['sales','purchases','treasury','expenses'].includes(q.kind))&&(!q.direction||q.kind==='treasury')&&(!(q.minQuantity||q.maxQuantity)||q.kind==='inventory')&&(!(q.minAmount||q.maxAmount)||q.kind!=='inventory'),{message:'INAPPLICABLE_FILTER'});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
const amount = z.string().regex(/^-?\d+\.\d{4}$/);
export const reportSchema = z.object({
  kind: reportKindSchema, from: z.coerce.date(), to: z.coerce.date(),
  total: z.number().int().nonnegative(), totalAmount: amount.nullable(), totalQuantity: amount.nullable(),
  limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
  rows: z.array(z.object({ id: z.string(), occurredAt: z.coerce.date(), label: z.string(), reference: z.string(), amount: amount.nullable(), quantity: amount.nullable() }))
});
export type OperationalReport = z.infer<typeof reportSchema>;

export const analyticsQuerySchema=z.object({from:z.coerce.date(),to:z.coerce.date()}).strict().refine(q=>q.from<=q.to&&q.to.getTime()-q.from.getTime()<=366*86400000,{message:'PERIOD_MAX_366_DAYS'});
export const analyticsSchema=z.object({from:z.coerce.date(),to:z.coerce.date(),points:z.array(z.object({date:z.string(),sales:amount,receipts:amount,payments:amount,net:amount})),exceptions:z.object({negativeStock:z.number().int(),expiredQuotations:z.number().int(),pendingReturns:z.number().int(),overCreditLimit:z.number().int(),negativeAccounts:z.number().int()})});
export type Analytics=z.infer<typeof analyticsSchema>;
