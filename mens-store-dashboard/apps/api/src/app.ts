import Fastify from 'fastify';
import { healthResponseSchema } from '@ahmed-store/contracts';

export function buildApp() {
  const app = Fastify({ logger: false });

  app.get('/api/v1/health', async () => healthResponseSchema.parse({ status: 'ok', service: 'api' }));

  return app;
}
