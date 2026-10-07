import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createIdentityService } from '../../src/modules/identity/service.js';

const prisma = new PrismaClient();
let organizationId = '';

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

const app = buildApp(identityService);

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: 'Integration Test Store' } });
  organizationId = organization.id;
  await app.ready();
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await app.close();
  await prisma.organization.delete({ where: { id: organizationId } });
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
  });
});
