import { z } from 'zod';

export * from './identity.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api')
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
