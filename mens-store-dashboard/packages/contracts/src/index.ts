import { z } from 'zod';

export * from './identity.js';
export * from './catalogue.js';
export * from './party.js';
export * from './sales.js';
export * from './finance.js';
export * from './purchasing.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api')
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
