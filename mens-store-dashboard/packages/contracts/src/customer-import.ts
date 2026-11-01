import {z} from 'zod';
import {createCustomerSchema} from './party.js';
export const customerImportErrorSchema=z.enum(['INVALID_WORKBOOK','EXPECTED_CUSTOMER_COLUMNS','INVALID_CUSTOMER','DUPLICATE_IN_FILE','CUSTOMER_EXISTS','NO_ROWS','TOO_MANY_ROWS']);
export const customerImportPreviewSchema=z.object({valid:z.boolean(),rows:z.array(createCustomerSchema.extend({row:z.number().int().positive()})),errors:z.array(z.object({row:z.number().int().positive(),message:customerImportErrorSchema}))});
export type CustomerImportPreview=z.infer<typeof customerImportPreviewSchema>;
// A bounded copy is retained only for original-key recovery after an uncertain upload.
export const customerImportCommandSchema=z.object({filename:z.string().min(1).max(255),content:z.string().min(4).max(1398104).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).strict();
export type CustomerImportCommand=z.infer<typeof customerImportCommandSchema>;
