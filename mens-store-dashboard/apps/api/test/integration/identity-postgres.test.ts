import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createIdentityService } from '../../src/modules/identity/service.js';
import { createSessionService } from '../../src/modules/identity/session.js';
import { hashPassword } from '../../src/modules/identity/password.js';
import { createCategoryService } from '../../src/modules/catalogue/category.js';

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
  },
  async createAuditEvent(input) {
    await prisma.auditEvent.create({ data: input });
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

const categoryService = createCategoryService({
  async list(currentOrganizationId) { return prisma.category.findMany({ where: { organizationId: currentOrganizationId, archivedAt: null } }); },
  async findByName(currentOrganizationId, name) { return prisma.category.findUnique({ where: { organizationId_name: { organizationId: currentOrganizationId, name } } }); },
  async create(category) { return prisma.category.create({ data: category }); },
  async archive(id, currentOrganizationId, archivedAt) {
    const updated = await prisma.category.updateMany({ where: { id, organizationId: currentOrganizationId, archivedAt: null }, data: { archivedAt } });
    return updated.count === 0 ? null : prisma.category.findUnique({ where: { id } });
  }
});

const productService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'SKU_EXISTS' as const }) };
const warehouseService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'WAREHOUSE_EXISTS' as const }) };
const stockService = { quantityAsOf: async () => '0.0000' };
const app = await buildApp(identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService);

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
  await prisma.inventoryTransaction.deleteMany({ where: { organizationId } });
  await prisma.product.deleteMany({ where: { organizationId } });
  await prisma.category.deleteMany({ where: { organizationId } });
  await prisma.warehouse.deleteMany({ where: { organizationId } });
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
  it('creates users only through an authenticated administrator and enforces tenant uniqueness', async () => {
    const administrator = {
      organizationId,
      name: 'Database Admin',
      email: `admin-${randomUUID()}@example.test`,
      password: 'SecurePassword123!',
      role: 'ADMIN' as const
    };
    await prisma.user.create({ data: { organizationId, name: administrator.name, email: administrator.email, passwordHash: await hashPassword(administrator.password), role: administrator.role } });
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: administrator });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const body = {
      name: 'Database User',
      email: `user-${randomUUID()}@example.test`,
      password: 'SecurePassword123!',
      role: 'ADMIN'
    };

    const created = await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie }, payload: body });
    expect(created.statusCode).toBe(201);

    const persisted = await prisma.user.findUnique({
      where: { organizationId_email: { organizationId, email: body.email } }
    });
    expect(persisted).toMatchObject({ organizationId, name: body.name, email: body.email, role: 'ADMIN' });
    expect(persisted?.passwordHash).not.toBe(body.password);

    const duplicate = await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie }, payload: body });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'EMAIL_TAKEN' });

    expect(login.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(200);
    await prisma.user.create({ data: { organizationId: otherOrganizationId, name: 'Other Store User', email: `other-${randomUUID()}@example.test`, passwordHash: 'not-used', role: 'ADMIN' } });
    const listed = await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie } });
    expect(listed.json().users).toHaveLength(2);
    expect(listed.json().users).toEqual(expect.arrayContaining([expect.objectContaining({ email: body.email, organizationId })]));
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
    expect(await prisma.auditEvent.count({ where: { organizationId, action: { in: ['AUTH_LOGIN', 'AUTH_LOGOUT', 'USER_CREATED'] } } })).toBe(3);
  });

  it('persists precise inventory movements and lets PostgreSQL reject zero quantities', async () => {
    const category = await prisma.category.create({ data: { organizationId, name: 'Shirts' } });
    const warehouse = await prisma.warehouse.create({ data: { organizationId, name: 'Main Warehouse' } });
    const product = await prisma.product.create({ data: { organizationId, categoryId: category.id, name: 'Oxford Shirt', sku: `SHIRT-${randomUUID()}`, barcode: `BC-${randomUUID()}`, salePrice: new Prisma.Decimal('150.2500'), costPrice: new Prisma.Decimal('100.1250') } });
    const movement = await prisma.inventoryTransaction.create({ data: { organizationId, warehouseId: warehouse.id, productId: product.id, type: 'OPENING_BALANCE', quantity: new Prisma.Decimal('5.2500'), referenceType: 'OPENING', referenceId: product.id } });

    expect(movement.quantity.toFixed(4)).toBe('5.2500');
    await expect(prisma.inventoryTransaction.create({ data: { organizationId, warehouseId: warehouse.id, productId: product.id, type: 'ADJUSTMENT', quantity: new Prisma.Decimal('0'), referenceType: 'TEST', referenceId: product.id } })).rejects.toThrow();
  });

  it('reconstructs warehouse stock accurately at a historical cutoff', async () => {
    const warehouse = await prisma.warehouse.create({ data: { organizationId, name: 'History Warehouse' } });
    const otherWarehouse = await prisma.warehouse.create({ data: { organizationId, name: 'Other Warehouse' } });
    const product = await prisma.product.create({ data: { organizationId, name: 'History Product', sku: `HISTORY-${randomUUID()}`, salePrice: new Prisma.Decimal('10.0000'), costPrice: new Prisma.Decimal('5.0000') } });
    await prisma.inventoryTransaction.createMany({ data: [
      { organizationId, warehouseId: warehouse.id, productId: product.id, type: 'OPENING_BALANCE', quantity: new Prisma.Decimal('10.0000'), referenceType: 'OPENING', referenceId: product.id, occurredAt: new Date('2026-01-01T00:00:00Z') },
      { organizationId, warehouseId: warehouse.id, productId: product.id, type: 'SALE_ISSUE', quantity: new Prisma.Decimal('-3.0000'), referenceType: 'SALE', referenceId: product.id, occurredAt: new Date('2026-01-03T00:00:00Z') },
      { organizationId, warehouseId: otherWarehouse.id, productId: product.id, type: 'OPENING_BALANCE', quantity: new Prisma.Decimal('50.0000'), referenceType: 'OPENING', referenceId: product.id, occurredAt: new Date('2026-01-01T00:00:00Z') }
    ] });
    const historical = await prisma.inventoryTransaction.aggregate({ _sum: { quantity: true }, where: { organizationId, warehouseId: warehouse.id, productId: product.id, occurredAt: { lte: new Date('2026-01-02T00:00:00Z') } } });
    const current = await prisma.inventoryTransaction.aggregate({ _sum: { quantity: true }, where: { organizationId, warehouseId: warehouse.id, productId: product.id } });
    expect(historical._sum.quantity?.toFixed(4)).toBe('10.0000');
    expect(current._sum.quantity?.toFixed(4)).toBe('7.0000');
  });
});
