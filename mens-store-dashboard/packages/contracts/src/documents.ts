import {z} from 'zod';
export const documentKindSchema=z.enum(['purchase','settlement']);
export const printableDocumentSchema=z.object({title:z.string(),id:z.string().uuid(),date:z.coerce.date(),facts:z.array(z.tuple([z.string(),z.string()])),columns:z.array(z.string()),rows:z.array(z.array(z.string())),total:z.string(),note:z.string().optional()});
export type PrintableDocument=z.infer<typeof printableDocumentSchema>;
