import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { createUserSchema, healthResponseSchema, loginSchema, registerUserSchema, type PublicUser } from '@ahmed-store/contracts';
import { can } from './modules/identity/authorization.js';
import type { RegistrationResult } from './modules/identity/service.js';
import type { AuthenticationService } from './modules/identity/session.js';

export interface IdentityService {
  register(input: ReturnType<typeof registerUserSchema.parse>): Promise<RegistrationResult>;
  auditUserCreated(actorUserId: string, user: PublicUser): Promise<void>;
}

export interface UserDirectoryService {
  list(organizationId: string): Promise<PublicUser[]>;
}

function readSessionToken(cookie: string | undefined) {
  return cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('session='))?.slice('session='.length);
}

function sessionCookie(token: string, expired = false) {
  const age = expired ? 0 : 8 * 60 * 60;
  return `session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}`;
}

export async function buildApp(identityService: IdentityService, authenticationService: AuthenticationService, userDirectoryService: UserDirectoryService) {
  const app = Fastify({ logger: false });

  await app.register(swagger, {
    openapi: {
      info: { title: 'Ahmed Store API', version: '1.0.0', description: 'Organization-scoped retail operations API.' },
      servers: [{ url: '/api/v1', description: 'Current server' }]
    }
  });

  app.get('/api/v1/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  app.get('/api/v1/health', { schema: { summary: 'Service health check', tags: ['System'] } }, async () => healthResponseSchema.parse({ status: 'ok', service: 'api' }));

  app.post('/api/v1/auth/login', { schema: { summary: 'Start a session', tags: ['Authentication'] } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_LOGIN' });
    const result = await authenticationService.login(parsed.data);
    if (!result.ok) return reply.code(401).send({ error: result.reason });
    return reply.header('set-cookie', sessionCookie(result.token)).send({ user: result.user });
  });

  app.get('/api/v1/auth/me', { schema: { summary: 'Get the current user', tags: ['Authentication'] } }, async (request, reply) => {
    const result = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!result.ok) return reply.code(401).send({ error: result.reason });
    return { user: result.user };
  });

  app.post('/api/v1/auth/logout', { schema: { summary: 'End the current session', tags: ['Authentication'] } }, async (request, reply) => {
    await authenticationService.logout(readSessionToken(request.headers.cookie));
    return reply.code(204).header('set-cookie', sessionCookie('', true)).send();
  });

  app.get('/api/v1/users', { schema: { summary: 'List organization users', tags: ['Users'] } }, async (request, reply) => {
    const result = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!result.ok) return reply.code(401).send({ error: result.reason });
    if (!can(result.user.role, 'users:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { users: await userDirectoryService.list(result.user.organizationId) };
  });

  app.post('/api/v1/users', { schema: { summary: 'Create an organization user', tags: ['Users'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'users:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_USER' });
    const result = await identityService.register({ ...parsed.data, organizationId: authenticated.user.organizationId });
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    await identityService.auditUserCreated(authenticated.user.id, result.user);
    return reply.code(201).send(result.user);
  });

  return app;
}
