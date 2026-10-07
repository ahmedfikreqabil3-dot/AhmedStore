import Fastify from 'fastify';
import { healthResponseSchema, registerUserSchema } from '@ahmed-store/contracts';
import type { RegistrationResult } from './modules/identity/service.js';

export interface IdentityService {
  register(input: ReturnType<typeof registerUserSchema.parse>): Promise<RegistrationResult>;
}

export function buildApp(identityService: IdentityService) {
  const app = Fastify({ logger: false });

  app.get('/api/v1/health', async () => healthResponseSchema.parse({ status: 'ok', service: 'api' }));

  app.post('/api/v1/auth/register', async (request, reply) => {
    const parsed = registerUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_REGISTRATION' });

    const result = await identityService.register(parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });

    return reply.code(201).send(result.user);
  });

  return app;
}
