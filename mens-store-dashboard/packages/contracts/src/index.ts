import { z } from 'zod';

export * from './identity.js';
export * from './catalogue.js';
export * from './party.js';
export * from './party-lifecycle.js';
export * from './customer-import.js';
export * from './sales.js';
export * from './finance.js';
export * from './purchasing.js';
export * from './inventory-transfer.js';
export * from './stock-count.js';
export * from './stock-threshold.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api')
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export * from './party-statement.js';
