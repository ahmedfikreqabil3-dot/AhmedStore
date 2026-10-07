import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createIdentityService } from '../../src/modules/identity/service.js';
import { createSessionService } from '../../src/modules/identity/session.js';
import { hashPassword } from '../../src/modules/identity/password.js';
import { createCategoryService } from '../../src/modules/catalogue/category.js';
import { createSalesService } from '../../src/modules/sales/service.js';

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
const inventoryMovementService = { post: async () => ({ ok: false as const, reason: 'PRODUCT_UNAVAILABLE' as const }) };
const customerService = { list: async () => [], create: async () => ({ ok: true as const, customer: { id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', organizationId: '', legacyId: null, name: 'Mohamed Ali', phone: null, email: null, address: null, notes: null, creditLimit: '0.0000', active: true, version: 1 } }) };
const salesService = { post: async () => ({ ok: false as const, reason: 'INSUFFICIENT_STOCK' }) };
const app = await buildApp(identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
const realSalesService = createSalesService({
  async findByIdempotencyKey(currentOrganizationId, idempotencyKey) {
    const sale = await prisma.sale.findFirst({ where: { organizationId: currentOrganizationId, idempotencyKey } });
    return sale && { id: sale.id, organizationId: sale.organizationId, customerId: sale.customerId, warehouseId: sale.warehouseId, subtotal: sale.subtotal.toFixed(4), discount: sale.discount.toFixed(4), total: sale.total.toFixed(4), occurredAt: sale.occurredAt };
  },
  async findCustomer(id, currentOrganizationId) {
    const customer = await prisma.customer.findFirst({ where: { id, organizationId: currentOrganizationId } });
    return customer && { ...customer, creditLimit: customer.creditLimit.toFixed(4) };
  },
  async findWarehouse(id, currentOrganizationId) {
    return prisma.warehouse.findFirst({ where: { id, organizationId: currentOrganizationId } });
  },
  async findProducts(ids, currentOrganizationId) {
    const products = await prisma.product.findMany({ where: { id: { in: ids }, organizationId: currentOrganizationId } });
    return products.map((product) => ({ ...product, salePrice: product.salePrice.toFixed(4), costPrice: product.costPrice.toFixed(4) }));
  },
  async post(command) {
    return prisma.$transaction(async (transaction) => {
      for (const line of command.input.lines) {
        const balance = await transaction.inventoryTransaction.aggregate({ _sum: { quantity: true }, where: { organizationId: command.organizationId, warehouseId: command.input.warehouseId, productId: line.productId, occurredAt: { lte: command.input.occurredAt } } });
        if ((balance._sum.quantity ?? new Prisma.Decimal(0)).lessThan(new Prisma.Decimal(line.quantity))) return { ok: false as const, reason: 'INSUFFICIENT_STOCK' as const };
      }
      const sale = await transaction.sale.create({ data: { id: command.id, organizationId: command.organizationId, customerId: command.input.customerId, warehouseId: command.input.warehouseId, actorUserId: command.actorUserId, idempotencyKey: command.idempotencyKey, subtotal: command.calculated.subtotal, discount: command.calculated.discount, total: command.calculated.total, occurredAt: command.input.occurredAt, lines: { create: command.calculated.lines.map((line, index) => ({ id: randomUUID(), lineNumber: index + 1, productId: line.productId, productName: command.products.get(line.productId)!.name, sku: command.products.get(line.productId)!.sku, quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount, total: line.total })) }, payments: { create: command.input.payments.map((payment) => ({ id: randomUUID(), method: payment.method, amount: payment.amount })) } } });
      await transaction.inventoryTransaction.createMany({ data: command.calculated.lines.map((line) => ({ id: randomUUID(), organizationId: command.organizationId, warehouseId: command.input.warehouseId, productId: line.productId, type: 'SALE_ISSUE', quantity: new Prisma.Decimal(line.quantity).negated(), referenceType: 'Sale', referenceId: sale.id, occurredAt: command.input.occurredAt })) });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'SALE_POSTED', entityType: 'Sale', entityId: sale.id } });
      return { ok: true as const, sale: { id: sale.id, organizationId: sale.organizationId, customerId: sale.customerId, warehouseId: sale.warehouseId, subtotal: sale.subtotal.toFixed(4), discount: sale.discount.toFixed(4), total: sale.total.toFixed(4), occurredAt: sale.occurredAt } };
    });
  }
});
const salesApp = await buildApp(identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, realSalesService);

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: 'Integration Test Store' } });
  organizationId = organization.id;
  const otherOrganization = await prisma.organization.create({ data: { name: 'Other Integration Store' } });
  otherOrganizationId = otherOrganization.id;
  await app.ready();
  await salesApp.ready();
});

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { organizationId } });
  await prisma.inventoryTransaction.deleteMany({ where: { organizationId } });
  await prisma.salePayment.deleteMany({ where: { sale: { organizationId } } });
  await prisma.saleLine.deleteMany({ where: { sale: { organizationId } } });
  await prisma.sale.deleteMany({ where: { organizationId } });
  await prisma.product.deleteMany({ where: { organizationId } });
  await prisma.category.deleteMany({ where: { organizationId } });
  await prisma.warehouse.deleteMany({ where: { organizationId } });
  await prisma.customer.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId: otherOrganizationId } });
});

afterAll(async () => {
  await app.close();
  await salesApp.close();
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

  it('posts an atomic sale, replays idempotently, and leaves no partial records when stock is insufficient', async () => {
    const administrator = { organizationId, name: 'Sales Admin', email: `sales-${randomUUID()}@example.test`, password: 'SecurePassword123!', role: 'ADMIN' as const };
    const user = await prisma.user.create({ data: { organizationId, name: administrator.name, email: administrator.email, passwordHash: await hashPassword(administrator.password), role: administrator.role } });
    const customer = await prisma.customer.create({ data: { organizationId, name: 'POS Customer', creditLimit: new Prisma.Decimal('1000.0000') } });
    const warehouse = await prisma.warehouse.create({ data: { organizationId, name: 'Sales Warehouse' } });
    const product = await prisma.product.create({ data: { organizationId, name: 'Sales Product', sku: `SALES-${randomUUID()}`, salePrice: new Prisma.Decimal('10.0000'), costPrice: new Prisma.Decimal('5.0000') } });
    const occurredAt = '2026-01-01T00:00:00.000Z';
    await prisma.inventoryTransaction.create({ data: { organizationId, warehouseId: warehouse.id, productId: product.id, type: 'OPENING_BALANCE', quantity: new Prisma.Decimal('5.0000'), referenceType: 'OPENING', referenceId: product.id, occurredAt: new Date(occurredAt) } });
    const login = await salesApp.inject({ method: 'POST', url: '/api/v1/auth/login', payload: administrator });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const body = { customerId: customer.id, warehouseId: warehouse.id, lines: [{ productId: product.id, quantity: '2.0000', unitPrice: '10.0000', discount: '1.0000' }], payments: [{ method: 'CASH', amount: '19.0000' }], occurredAt };

    const created = await salesApp.inject({ method: 'POST', url: '/api/v1/sales', headers: { cookie, 'idempotency-key': 'sale-1' }, payload: body });
    expect(created.statusCode).toBe(201);
    const saleId = created.json().id;
    expect(await prisma.sale.findUnique({ where: { id: saleId }, include: { lines: true, payments: true } })).toMatchObject({ total: new Prisma.Decimal('19.0000'), lines: [{ quantity: new Prisma.Decimal('2.0000'), total: new Prisma.Decimal('19.0000') }], payments: [{ method: 'CASH', amount: new Prisma.Decimal('19.0000') }] });
    const balance = await prisma.inventoryTransaction.aggregate({ _sum: { quantity: true }, where: { organizationId, warehouseId: warehouse.id, productId: product.id } });
    expect(balance._sum.quantity?.toFixed(4)).toBe('3.0000');
    expect(await prisma.auditEvent.findFirst({ where: { organizationId, action: 'SALE_POSTED', entityId: saleId } })).toMatchObject({ actorUserId: user.id });

    expect((await salesApp.inject({ method: 'POST', url: '/api/v1/sales', headers: { cookie, 'idempotency-key': 'sale-1' }, payload: body })).statusCode).toBe(200);
    expect(await prisma.sale.count({ where: { organizationId } })).toBe(1);
    const rejected = await salesApp.inject({ method: 'POST', url: '/api/v1/sales', headers: { cookie, 'idempotency-key': 'sale-2' }, payload: { ...body, lines: [{ ...body.lines[0], quantity: '4.0000', discount: '0.0000' }], payments: [{ method: 'CASH', amount: '40.0000' }] } });
    expect(rejected.statusCode).toBe(409);
    expect(await prisma.sale.count({ where: { organizationId } })).toBe(1);
    expect(await prisma.inventoryTransaction.count({ where: { organizationId, productId: product.id } })).toBe(2);
  });
});
