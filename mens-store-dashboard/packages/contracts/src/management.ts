import {z} from 'zod';
export const masterKindSchema=z.enum(['products','warehouses','categories']);
export const masterChangeSchema=z.object({version:z.string().datetime(),name:z.string().trim().min(2).max(160),active:z.boolean()}).strict();
export const masterRowSchema=z.object({id:z.string().uuid(),name:z.string(),active:z.boolean(),version:z.string().datetime()});
export const settingsSchema=z.object({name:z.string().trim().min(2).max(120),phone:z.string().trim().max(40),address:z.string().trim().max(300),receiptHeader:z.string().trim().max(300).default(''),receiptFooter:z.string().trim().max(300),version:z.number().int().positive()}).strict();

export const documentSettingsSchema=settingsSchema.omit({version:true});
