import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createIdentityService } from '../../src/modules/identity/service.js';
import { createSessionService } from '../../src/modules/identity/session.js';

const prisma = new PrismaClient();
let organizationId = '';
let otherOrganizationId = '';

const identityService = createIdentityService({
  async findByEmail(currentOrganizationId, email) {
    return prisma.user.findUnique({
      where: { organizationId_email: { organizationId: currentOrganizationId, email } }
    });
  },
  async create(user) {
    return prisma.user.create({ data: user });
  }
});

const authenticationService = createSessionService({
  async findUserByEmail(currentOrganizationId, email) { return prisma.user.findUnique({ where: { organizationId_email: { organizationId: currentOrganizationId, email } } }); },
  async createSession(input) { await prisma.session.create({ data: input }); },
  async findSession(tokenHash) { return prisma.session.findUnique({ where: { tokenHash }, include: { user: true } }); },
  async revokeSession(id, revokedAt) { await prisma.session.update({ where: { id }, data: { revokedAt } }); },
  async createAuditEvent(input) { await prisma.auditEvent.create({ data: input }); }
});

const userDirectoryService = {
  async list(currentOrganizationId: string) {
    const users = await prisma.user.findMany({ where: { organizationId: currentOrganizationId }, orderBy: { createdAt: 'asc' } });
    return users.map(({ passwordHash: _passwordHash, active: _active, ...user }) => user);
  }
};

const app = buildApp(identityService, authenticationService, userDirectoryService);

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: 'Integration Test Store' } });
  organizationId = organization.id;
  const otherOrganization = await prisma.organization.create({ data: { name: 'Other Integration Store' } });
  otherOrganizationId = otherOrganization.id;
  await app.ready();
});

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId: otherOrganizationId } });
});

afterAll(async () => {
  await app.close();
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.organization.delete({ where: { id: otherOrganizationId } });
  await prisma.$disconnect();
});

describe('identity registration against PostgreSQL', () => {
  it('persists a user and enforces the organization-email uniqueness rule', async () => {
    const body = {
      organizationId,
      name: 'Database Admin',
      email: `admin-${randomUUID()}@example.test`,
      password: 'SecurePassword123!',
      role: 'ADMIN'
    };

    const created = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: body });
    expect(created.statusCode).toBe(201);

    const persisted = await prisma.user.findUnique({
      where: { organizationId_email: { organizationId, email: body.email } }
    });
    expect(persisted).toMatchObject({ organizationId, name: body.name, email: body.email, role: 'ADMIN' });
    expect(persisted?.passwordHash).not.toBe(body.password);

    const duplicate = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: body });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'EMAIL_TAKEN' });

    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { organizationId, email: body.email, password: body.password } });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    expect(login.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(200);
    await prisma.user.create({ data: { organizationId: otherOrganizationId, name: 'Other Store User', email: `other-${randomUUID()}@example.test`, passwordHash: 'not-used', role: 'ADMIN' } });
    const listed = await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie } });
    expect(listed.json().users).toHaveLength(1);
    expect(listed.json().users[0]).toMatchObject({ email: body.email, organizationId });
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
    expect(await prisma.auditEvent.count({ where: { organizationId, action: { in: ['AUTH_LOGIN', 'AUTH_LOGOUT'] } } })).toBe(2);
  });
});
