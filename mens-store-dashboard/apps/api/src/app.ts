import Fastify from 'fastify';
import { healthResponseSchema, loginSchema, registerUserSchema } from '@ahmed-store/contracts';
import type { RegistrationResult } from './modules/identity/service.js';
import type { AuthenticationService } from './modules/identity/session.js';

export interface IdentityService {
  register(input: ReturnType<typeof registerUserSchema.parse>): Promise<RegistrationResult>;
}

function readSessionToken(cookie: string | undefined) {
  return cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('session='))?.slice('session='.length);
}

function sessionCookie(token: string, expired = false) {
  const age = expired ? 0 : 8 * 60 * 60;
  return `session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}`;
}

export function buildApp(identityService: IdentityService, authenticationService: AuthenticationService) {
  const app = Fastify({ logger: false });

  app.get('/api/v1/health', async () => healthResponseSchema.parse({ status: 'ok', service: 'api' }));

  app.post('/api/v1/auth/register', async (request, reply) => {
    const parsed = registerUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_REGISTRATION' });

    const result = await identityService.register(parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });

    return reply.code(201).send(result.user);
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_LOGIN' });
    const result = await authenticationService.login(parsed.data);
    if (!result.ok) return reply.code(401).send({ error: result.reason });
    return reply.header('set-cookie', sessionCookie(result.token)).send({ user: result.user });
  });

  app.get('/api/v1/auth/me', async (request, reply) => {
    const result = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!result.ok) return reply.code(401).send({ error: result.reason });
    return { user: result.user };
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    await authenticationService.logout(readSessionToken(request.headers.cookie));
    return reply.code(204).header('set-cookie', sessionCookie('', true)).send();
  });

  return app;
}
