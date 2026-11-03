import { z } from 'zod';
import { partyStatementQuerySchema } from './party-statement.js';

export const treasuryMethodSchema = z.enum(['CASH', 'CARD', 'WALLET', 'INSTAPAY']);
const nonnegative = z.string().regex(/^\d{1,15}(?:\.\d{1,4})?$/);
const positive = nonnegative.refine(value => !/^0+(?:\.0+)?$/.test(value), 'POSITIVE_AMOUNT_REQUIRED');
const reason = z.string().trim().min(3).max(500);
export const createTreasuryAccountSchema = z.object({
  name: z.string().trim().min(2).max(100).refine(value => !value.startsWith('الخزينة الافتراضية'), 'RESERVED_NAME'),
  paymentMethod: treasuryMethodSchema, openingBalance: nonnegative.default('0'), reason
}).strict();
export const treasuryTransferSchema = z.object({ fromAccountId: z.string().uuid(), toAccountId: z.string().uuid(), amount: positive, reason }).strict()
  .refine(value => value.fromAccountId !== value.toAccountId, 'DIFFERENT_ACCOUNTS_REQUIRED');
export const settlementSchema = z.object({
  kind: z.enum(['customers', 'suppliers']), partyId: z.string().uuid(), accountId: z.string().uuid(), amount: positive, reason,
  allocations: z.array(z.object({ documentId: z.string().uuid(), amount: positive }).strict()).max(100).default([])
}).strict().refine(value => new Set(value.allocations.map(row => row.documentId)).size === value.allocations.length, 'DUPLICATE_DOCUMENT');
export const treasuryCommandSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('account'), input: createTreasuryAccountSchema }),
  z.object({ operation: z.literal('transfer'), input: treasuryTransferSchema }),
  z.object({ operation: z.literal('settlement'), input: settlementSchema })
]);
export type TreasuryCommand = z.infer<typeof treasuryCommandSchema>;
export type CreateTreasuryAccount = z.infer<typeof createTreasuryAccountSchema>;
export type TreasuryTransferInput = z.infer<typeof treasuryTransferSchema>;
export type SettlementInput = z.infer<typeof settlementSchema>;
export const treasuryHistoryQuerySchema = partyStatementQuerySchema;
export const settlementPartyQuerySchema = z.object({ kind: z.enum(['customers', 'suppliers']), search: z.string().trim().max(100).default('') }).strict();
export const settlementInvoiceQuerySchema = z.object({ kind: z.enum(['customers', 'suppliers']), partyId: z.string().uuid() }).strict();
const exactAmount = z.string().regex(/^-?\d+\.\d{4}$/);
export const treasuryAccountSchema = z.object({ id: z.string().uuid(), name: z.string(), paymentMethod: treasuryMethodSchema, isDefault: z.boolean(), active: z.boolean(), version: z.number().int(), balance: exactAmount });
export const treasuryAccountsSchema = z.object({ accounts: z.array(treasuryAccountSchema) });
export const settlementPartiesSchema = z.object({ parties: z.array(z.object({ id: z.string().uuid(), name: z.string(), balance: exactAmount })) });
export const settlementInvoicesSchema = z.object({ invoices: z.array(z.object({ id: z.string().uuid(), occurredAt: z.coerce.date(), balance: exactAmount })) });
export const treasuryLedgerSchema = z.object({
  account: treasuryAccountSchema, from: z.coerce.date(), to: z.coerce.date(), opening: exactAmount, receipts: exactAmount, payments: exactAmount, closing: exactAmount,
  total: z.number().int().nonnegative(), limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
  rows: z.array(z.object({ id: z.string(), occurredAt: z.coerce.date(), type: z.string(), sourceType: z.string(), sourceId: z.string(), amount: exactAmount, balance: exactAmount }))
});
export const treasuryPostingSchema = z.object({ id: z.string().uuid(), amount: exactAmount, occurredAt: z.coerce.date(), replayed: z.boolean() });
export type TreasuryAccount = z.infer<typeof treasuryAccountSchema>;
export type TreasuryLedger = z.infer<typeof treasuryLedgerSchema>;

export const updateTreasuryAccountSchema=z.object({version:z.number().int().positive(),name:z.string().trim().min(2).max(100).optional(),active:z.boolean().optional(),makeDefault:z.boolean().optional(),replacementAccountId:z.string().uuid().optional(),reason}).strict().refine(v=>v.name!==undefined||v.active!==undefined||v.makeDefault===true,'CHANGE_REQUIRED');
export type UpdateTreasuryAccount=z.infer<typeof updateTreasuryAccountSchema>;
