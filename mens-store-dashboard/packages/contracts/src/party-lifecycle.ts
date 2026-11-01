import { z } from 'zod';
import {customerSchema,supplierSchema} from './party.js';
export const partyDirectoryStatusSchema=z.enum(['active','archived','all']);
export type PartyDirectoryStatus=z.infer<typeof partyDirectoryStatusSchema>;
export const partyDirectoryQuerySchema=z.object({status:partyDirectoryStatusSchema.default('all'),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict();
export type PartyDirectoryQuery=z.infer<typeof partyDirectoryQuerySchema>;
const pagination={total:z.number().int().nonnegative(),limit:z.number().int().positive(),offset:z.number().int().nonnegative()};
export const partyDirectoryResultSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('customers'),parties:z.array(customerSchema),...pagination}),
  z.object({kind:z.literal('suppliers'),parties:z.array(supplierSchema),...pagination})
]);
export type PartyDirectoryResult=z.infer<typeof partyDirectoryResultSchema>;
export const partyLifecycleSchema=z.object({version:z.number().int().positive(),active:z.boolean(),reason:z.string().trim().min(3).max(500)}).strict();
export type PartyLifecycleInput=z.infer<typeof partyLifecycleSchema>;
export const partyLifecycleResultSchema=z.object({id:z.string().uuid(),active:z.boolean(),version:z.number().int().positive()});
