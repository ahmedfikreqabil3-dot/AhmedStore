import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const authenticationService = {
  login: async () => ({ ok: false as const, reason: 'INVALID_CREDENTIALS' as const }),
  authenticate: async () => ({ ok: false as const, reason: 'UNAUTHENTICATED' as const }),
  logout: async () => undefined
};

const input = {
  organizationId: '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55',
  name: 'Ahmed Faisal',
  email: 'ahmed@example.com',
  password: 'a-secure-password',
  role: 'ADMIN'
};

const registeredUser = {
  id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f',
  organizationId: input.organizationId,
  name: input.name,
  email: input.email,
  role: 'ADMIN' as const
};
const userDirectoryService = { list: async () => [registeredUser] };
const categoryService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'CATEGORY_EXISTS' as const }) };
const productService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'SKU_EXISTS' as const }) };
const warehouseService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'WAREHOUSE_EXISTS' as const }) };
const stockService = { quantityAsOf: async () => '0.0000' };
const inventoryMovementService = { post: async () => ({ ok: false as const, reason: 'PRODUCT_UNAVAILABLE' as const }) };
const customerService = {
  list: async () => [],
  create: async () => ({ ok: true as const, customer: { id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', organizationId: input.organizationId, legacyId: null, name: 'Mohamed Ali', phone: null, email: null, address: null, notes: null, creditLimit: '0.0000', active: true, version: 1 } })
};
const salesService = { post: async () => ({ ok: false as const, reason: 'INSUFFICIENT_STOCK' }) };
const successIdentity = { register: async () => ({ ok: true as const, user: registeredUser }), auditUserCreated: async () => undefined };

describe('API health endpoint', () => {
  it('returns the versioned API health response', async () => {
    const app = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const openapi = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'api' });
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json()).toMatchObject({ openapi: expect.any(String), info: { title: 'Ahmed Store API' }, servers: [{ url: '/api/v1' }], paths: { '/auth/login': expect.any(Object), '/users': expect.any(Object) } });
    await app.close();
  });


  it('validates login, issues a secure cookie, authenticates me, and clears it on logout', async () => {
    let loggedOutToken: string | undefined;
    const auth = {
      login: async () => ({ ok: true as const, token: 'opaque-token', user: registeredUser }),
      authenticate: async (token: string | undefined) => token === 'opaque-token'
        ? ({ ok: true as const, token, user: registeredUser })
        : ({ ok: false as const, reason: 'UNAUTHENTICATED' as const }),
      logout: async (token: string | undefined) => { loggedOutToken = token; }
    };
    const app = await buildApp(successIdentity, auth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { organizationId: input.organizationId, email: input.email, password: 'a-secure-password' } });
    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: 'other=x; session=opaque-token' } });
    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: 'session=opaque-token' } });

    expect(invalid.statusCode).toBe(400);
    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    expect(login.headers['set-cookie']).toContain('SameSite=Strict');
    expect(unauthorized.statusCode).toBe(401);
    expect(me.json()).toEqual({ user: registeredUser });
    expect(logout.statusCode).toBe(204);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
    expect(loggedOutToken).toBe('opaque-token');
    await app.close();
  });

  it('returns an authentication error for rejected login credentials', async () => {
    const app = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { organizationId: input.organizationId, email: input.email, password: 'a-secure-password' } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('enforces authentication and the users-manage permission for tenant-scoped users', async () => {
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const identity = successIdentity;
    const anonymous = await buildApp(identity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const cashier = await buildApp(identity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const admin = await buildApp(identity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/users' })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: 'session=token' } })).json()).toEqual({ users: [registeredUser] });
    await Promise.all([anonymous.close(), cashier.close(), admin.close()]);
  });

  it('allows only an admin to create a user in their own organization and writes an audit event', async () => {
    let audited = false;
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) };
    const identity = { ...successIdentity, auditUserCreated: async () => { audited = true; } };
    const app = await buildApp(identity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const anonymous = await buildApp(identity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const cashier = await buildApp(identity, { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) }, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie: 'session=token' }, payload: {} });
    const created = await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie: 'session=token' }, payload: { name: input.name, email: input.email, password: input.password, role: input.role } });
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/users', payload: {} })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie: 'session=token' }, payload: {} })).statusCode).toBe(403);
    expect(invalid.statusCode).toBe(400);
    expect(created.statusCode).toBe(201);
    expect(audited).toBe(true);
    await Promise.all([app.close(), anonymous.close(), cashier.close()]);
  });

  it('enforces inventory permission and tenant scope for category listing and creation', async () => {
    const category = { id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', organizationId: input.organizationId, name: 'Shirts', archivedAt: null };
    const catalogue = { list: async () => [category], create: async (_organizationId: string, body: { name: string }) => body.name === 'Shirts' ? ({ ok: true as const, category }) : ({ ok: false as const, reason: 'CATEGORY_EXISTS' as const }) };
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const admin = await buildApp(successIdentity, adminAuth, userDirectoryService, catalogue, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, catalogue, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, catalogue, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/categories' })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/categories', headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/categories', payload: {} })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/categories', headers: { cookie: 'session=token' }, payload: {} })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'GET', url: '/api/v1/categories', headers: { cookie: 'session=token' } })).json()).toEqual({ categories: [category] });
    expect((await admin.inject({ method: 'POST', url: '/api/v1/categories', headers: { cookie: 'session=token' }, payload: {} })).statusCode).toBe(400);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/categories', headers: { cookie: 'session=token' }, payload: { name: 'Other' } })).statusCode).toBe(409);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/categories', headers: { cookie: 'session=token' }, payload: { name: 'Shirts' } })).json()).toEqual(category);
    await Promise.all([admin.close(), anonymous.close(), cashier.close()]);
  });

  it('lists and creates tenant-scoped products and warehouses with validation and conflict handling', async () => {
    const product = { id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', organizationId: input.organizationId, categoryId: null, name: 'Oxford shirt', sku: 'OX-1', barcode: '123456', salePrice: '150.0000', costPrice: '100.0000', active: true, version: 1 };
    const warehouse = { id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', organizationId: input.organizationId, name: 'Main warehouse', active: true };
    const products = { list: async () => [product], create: async (_organizationId: string, body: { name: string }) => body.name === 'Duplicate' ? ({ ok: false as const, reason: 'SKU_EXISTS' as const }) : ({ ok: true as const, product }) };
    const warehouses = { list: async () => [warehouse], create: async (_organizationId: string, body: { name: string }) => body.name === 'Duplicate' ? ({ ok: false as const, reason: 'WAREHOUSE_EXISTS' as const }) : ({ ok: true as const, warehouse }) };
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const admin = await buildApp(successIdentity, adminAuth, userDirectoryService, categoryService, products, warehouses, stockService, inventoryMovementService, customerService, salesService);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, products, warehouses, stockService, inventoryMovementService, customerService, salesService);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, products, warehouses, stockService, inventoryMovementService, customerService, salesService);
    const productInput = { name: product.name, sku: product.sku, barcode: product.barcode, categoryId: null, salePrice: product.salePrice, costPrice: product.costPrice };

    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/products' })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: 'session=token' } })).json()).toEqual({ products: [product] });
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/products', payload: {} })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/products', headers: { cookie: 'session=token' }, payload: productInput })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/products', headers: { cookie: 'session=token' }, payload: {} })).statusCode).toBe(400);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/products', headers: { cookie: 'session=token' }, payload: { ...productInput, name: 'Duplicate' } })).statusCode).toBe(409);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/products', headers: { cookie: 'session=token' }, payload: productInput })).statusCode).toBe(201);

    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/warehouses' })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/warehouses', headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'GET', url: '/api/v1/warehouses', headers: { cookie: 'session=token' } })).json()).toEqual({ warehouses: [warehouse] });
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/warehouses', payload: {} })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/warehouses', headers: { cookie: 'session=token' }, payload: { name: warehouse.name } })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/warehouses', headers: { cookie: 'session=token' }, payload: {} })).statusCode).toBe(400);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/warehouses', headers: { cookie: 'session=token' }, payload: { name: 'Duplicate' } })).statusCode).toBe(409);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/warehouses', headers: { cookie: 'session=token' }, payload: { name: warehouse.name } })).statusCode).toBe(201);
    await Promise.all([admin.close(), anonymous.close(), cashier.close()]);
  });

  it('returns historical stock only to inventory roles and validates the filter', async () => {
    const productId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
    const warehouseId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
    let received: unknown;
    const stock = { quantityAsOf: async (...args: unknown[]) => { received = args; return '7.2500'; } };
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const admin = await buildApp(successIdentity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stock, inventoryMovementService, customerService, salesService);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stock, inventoryMovementService, customerService, salesService);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stock, inventoryMovementService, customerService, salesService);
    const query = `productId=${productId}&warehouseId=${warehouseId}&asOf=2026-01-01T00:00:00.000Z`;

    expect((await anonymous.inject({ method: 'GET', url: `/api/v1/inventory/stock?${query}` })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: `/api/v1/inventory/stock?${query}`, headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'GET', url: '/api/v1/inventory/stock', headers: { cookie: 'session=token' } })).statusCode).toBe(400);
    expect((await admin.inject({ method: 'GET', url: `/api/v1/inventory/stock?${query}`, headers: { cookie: 'session=token' } })).json()).toEqual({ quantity: '7.2500' });
    expect(received).toEqual([input.organizationId, productId, new Date('2026-01-01T00:00:00.000Z'), warehouseId]);
    await Promise.all([admin.close(), anonymous.close(), cashier.close()]);
  });

  it('posts only validated idempotent inventory movements for inventory roles', async () => {
    const productId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
    const warehouseId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
    const movementInput = { productId, warehouseId, type: 'ADJUSTMENT' as const, quantity: '-2.0000', referenceType: 'COUNT', referenceId: 'count-1', occurredAt: '2026-01-01T00:00:00.000Z' };
    const movement = { id: 'a0ac2c74-c66c-4a28-b658-34c88db36e8a', organizationId: input.organizationId, idempotencyKey: 'key-1', ...movementInput, occurredAt: new Date(movementInput.occurredAt) };
    const movements = { post: async (_organizationId: string, _actorUserId: string, key: string) => key === 'unavailable' ? ({ ok: false as const, reason: 'WAREHOUSE_UNAVAILABLE' as const }) : ({ ok: true as const, movement, replayed: key === 'replay' }) };
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const admin = await buildApp(successIdentity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, movements, customerService, salesService);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, movements, customerService, salesService);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, movements, customerService, salesService);

    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/inventory/movements', payload: movementInput })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/inventory/movements', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: movementInput })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/inventory/movements', headers: { cookie: 'session=token' }, payload: movementInput })).statusCode).toBe(400);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/inventory/movements', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: {} })).statusCode).toBe(400);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/inventory/movements', headers: { cookie: 'session=token', 'idempotency-key': 'unavailable' }, payload: movementInput })).statusCode).toBe(409);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/inventory/movements', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: movementInput })).statusCode).toBe(201);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/inventory/movements', headers: { cookie: 'session=token', 'idempotency-key': 'replay' }, payload: movementInput })).statusCode).toBe(200);
    await Promise.all([admin.close(), anonymous.close(), cashier.close()]);
  });

  it('calculates shift totals only for Finance or Admin from a valid period', async () => {
    const totals = { receipts: '100.0000', refunds: '20.0000', net: '80.0000', methods: [{ method: 'CASH', receipts: '100.0000', refunds: '20.0000', net: '80.0000' }] };
    const shiftTotals = { summarize: async (_organizationId: string, openedAt: Date, closedAt: Date) => closedAt <= openedAt ? ({ ok: false as const, reason: 'INVALID_SHIFT_PERIOD' as const }) : ({ ok: true as const, totals }) };
    const financeAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'FINANCE' as const } }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const finance = await buildApp(successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, shiftTotals);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, shiftTotals);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, shiftTotals);
    const period = 'openedAt=2026-01-01T00%3A00%3A00.000Z&closedAt=2026-01-01T08%3A00%3A00.000Z';

    expect((await anonymous.inject({ method: 'GET', url: `/api/v1/finance/shift-totals?${period}` })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: `/api/v1/finance/shift-totals?${period}`, headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await finance.inject({ method: 'GET', url: '/api/v1/finance/shift-totals', headers: { cookie: 'session=token' } })).statusCode).toBe(400);
    expect((await finance.inject({ method: 'GET', url: '/api/v1/finance/shift-totals?openedAt=2026-01-01T08%3A00%3A00.000Z&closedAt=2026-01-01T08%3A00%3A00.000Z', headers: { cookie: 'session=token' } })).statusCode).toBe(400);
    expect((await finance.inject({ method: 'GET', url: `/api/v1/finance/shift-totals?${period}`, headers: { cookie: 'session=token' } })).json()).toEqual(totals);
    await Promise.all([finance.close(), cashier.close(), anonymous.close()]);
  });

  it('lets a cashier own one shift while Finance reviews closed shifts and their ledger totals', async () => {
    const openShift = { id: 'shift-1', organizationId: input.organizationId, userId: registeredUser.id, status: 'OPEN' as const, openedAt: new Date('2026-10-08T08:00:00.000Z'), closedAt: null, closedByUserId: null, expectedCash: null, countedCash: null, cashDifference: null, discrepancyReason: null, reviewedAt: null, reviewedByUserId: null };
    const closedShift = { ...openShift, status: 'CLOSED' as const, closedAt: new Date('2026-10-08T16:00:00.000Z'), closedByUserId: registeredUser.id };
    const reviewedShift = { ...closedShift, status: 'REVIEWED' as const, reviewedAt: new Date('2026-10-08T16:01:00.000Z'), reviewedByUserId: 'finance-1' };
    const jsonShift = <T extends typeof openShift | typeof closedShift | typeof reviewedShift>(shift: T) => ({ ...shift, openedAt: shift.openedAt.toISOString(), closedAt: shift.closedAt?.toISOString() ?? null, reviewedAt: shift.reviewedAt?.toISOString() ?? null });
    let failOpen = false;
    const shifts = {
      open: async () => failOpen ? ({ ok: false as const, reason: 'SHIFT_ALREADY_OPEN' as const }) : ({ ok: true as const, shift: openShift }),
      current: async () => openShift,
      close: async (_org: string, _user: string, id: string) => id === 'missing' ? ({ ok: false as const, reason: 'SHIFT_NOT_FOUND' as const }) : id === 'other' ? ({ ok: false as const, reason: 'SHIFT_NOT_OWNED' as const }) : id === 'closed' ? ({ ok: false as const, reason: 'SHIFT_NOT_OPEN' as const }) : ({ ok: true as const, shift: closedShift }),
      review: async (_org: string, _user: string, id: string) => id === 'missing' ? ({ ok: false as const, reason: 'SHIFT_NOT_FOUND' as const }) : id === 'reviewed' ? ({ ok: false as const, reason: 'SHIFT_NOT_CLOSED' as const }) : ({ ok: true as const, shift: reviewedShift }),
      summary: async (_org: string, _requester: string, canReview: boolean, id: string) => id === 'missing' ? ({ ok: false as const, reason: 'SHIFT_NOT_FOUND' as const }) : id === 'invalid' ? ({ ok: false as const, reason: 'INVALID_SHIFT_PERIOD' as const }) : id === 'foreign' && !canReview ? ({ ok: false as const, reason: 'FORBIDDEN' as const }) : ({ ok: true as const, shift: id === 'foreign' ? { ...closedShift, userId: 'another-cashier' } : closedShift, totals: { receipts: '100.0000', refunds: '20.0000', net: '80.0000', methods: [] } }),
      listClosed: async () => [closedShift]
    };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const financeAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, id: 'finance-1', role: 'FINANCE' as const } }) };
    const warehouseAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'WAREHOUSE' as const } }) };
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, shifts);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, shifts);
    const finance = await buildApp(successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, shifts);
    const warehouse = await buildApp(successIdentity, warehouseAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, shifts);
    const headers = { cookie: 'session=token' };

    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/shifts/open' })).statusCode).toBe(401);
    expect((await warehouse.inject({ method: 'POST', url: '/api/v1/shifts/open', headers })).statusCode).toBe(403);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/open', headers })).statusCode).toBe(201);
    failOpen = true;
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/open', headers })).statusCode).toBe(409);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/shifts/current' })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/shifts/current', headers })).json()).toEqual({ shift: jsonShift(openShift) });
    expect((await warehouse.inject({ method: 'GET', url: '/api/v1/shifts/current', headers })).statusCode).toBe(403);
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/shifts/shift-1/close' })).statusCode).toBe(401);
    expect((await warehouse.inject({ method: 'POST', url: '/api/v1/shifts/shift-1/close', headers })).statusCode).toBe(403);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/shift-1/close', headers })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/shift-1/close', headers, payload: { countedCash: 'invalid' } })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/shift-1/close', headers, payload: { countedCash: '1.0000', discrepancyReason: ' ' } })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/missing/close', headers, payload: { countedCash: '100.0000', discrepancyReason: 'Cash counted' } })).statusCode).toBe(404);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/other/close', headers, payload: { countedCash: '100.0000' } })).statusCode).toBe(409);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/closed/close', headers, payload: { countedCash: '100.0000' } })).statusCode).toBe(409);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/shift-1/close', headers, payload: { countedCash: '100.0000' } })).json()).toEqual(jsonShift(closedShift));
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/shifts/shift-1/summary', headers })).json()).toEqual({ shift: jsonShift(closedShift), totals: { receipts: '100.0000', refunds: '20.0000', net: '80.0000', methods: [] } });
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/shifts/missing/summary', headers })).statusCode).toBe(404);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/shifts/invalid/summary', headers })).statusCode).toBe(409);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/shifts/foreign/summary', headers })).statusCode).toBe(403);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/shifts/shift-1/summary' })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/shifts', headers })).statusCode).toBe(403);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/shifts' })).statusCode).toBe(401);
    expect((await finance.inject({ method: 'GET', url: '/api/v1/shifts', headers })).json()).toEqual({ shifts: [jsonShift(closedShift)] });
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/shifts/shift-1/review', headers })).statusCode).toBe(403);
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/shifts/shift-1/review' })).statusCode).toBe(401);
    expect((await finance.inject({ method: 'POST', url: '/api/v1/shifts/missing/review', headers })).statusCode).toBe(404);
    expect((await finance.inject({ method: 'POST', url: '/api/v1/shifts/reviewed/review', headers })).statusCode).toBe(409);
    expect((await finance.inject({ method: 'POST', url: '/api/v1/shifts/shift-1/review', headers })).json()).toEqual(jsonShift(reviewedShift));
    await Promise.all([anonymous.close(), cashier.close(), finance.close(), warehouse.close()]);
  });

  it('lists and creates tenant-scoped customers for sales roles', async () => {
    const customer = { id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', organizationId: input.organizationId, legacyId: null, name: 'Mohamed Ali', phone: '01012345678', email: 'mohamed@example.test', address: 'Cairo', notes: 'VIP', creditLimit: '5000.0000', active: true, version: 1 };
    const customers = { list: async () => [customer], create: async () => ({ ok: true as const, customer }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const warehouseAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'WAREHOUSE' as const } }) };
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customers, salesService);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customers, salesService);
    const warehouse = await buildApp(successIdentity, warehouseAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customers, salesService);
    const body = { name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, notes: customer.notes, creditLimit: customer.creditLimit };

    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/customers' })).statusCode).toBe(401);
    expect((await warehouse.inject({ method: 'GET', url: '/api/v1/customers', headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/customers', headers: { cookie: 'session=token' } })).json()).toEqual({ customers: [customer] });
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/customers', payload: body })).statusCode).toBe(401);
    expect((await warehouse.inject({ method: 'POST', url: '/api/v1/customers', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(403);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/customers', headers: { cookie: 'session=token' }, payload: {} })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/customers', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(201);
    await Promise.all([cashier.close(), anonymous.close(), warehouse.close()]);
  });

  it('posts only valid idempotent sales for sales roles', async () => {
    const customerId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
    const warehouseId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
    const productId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
    const body = { customerId, warehouseId, lines: [{ productId, quantity: '1.0000', unitPrice: '10.0000', discount: '0.0000' }], payments: [{ method: 'CASH', amount: '10.0000' }], occurredAt: '2026-01-01T00:00:00.000Z' };
    const sales = { post: async (_organizationId: string, _actorUserId: string, key: string) => key === 'insufficient' ? ({ ok: false as const, reason: 'INSUFFICIENT_STOCK' }) : ({ ok: true as const, sale: { id: '9f112860-9eb3-402f-b722-740616412a85' }, replayed: key === 'replay' }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const warehouseAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'WAREHOUSE' as const } }) };
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, sales);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, sales);
    const warehouse = await buildApp(successIdentity, warehouseAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, sales);

    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/sales', payload: body })).statusCode).toBe(401);
    expect((await warehouse.inject({ method: 'POST', url: '/api/v1/sales', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: body })).statusCode).toBe(403);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/sales', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/sales', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: {} })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/sales', headers: { cookie: 'session=token', 'idempotency-key': 'insufficient' }, payload: body })).statusCode).toBe(409);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/sales', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: body })).statusCode).toBe(201);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/sales', headers: { cookie: 'session=token', 'idempotency-key': 'replay' }, payload: body })).statusCode).toBe(200);
    await Promise.all([cashier.close(), anonymous.close(), warehouse.close()]);
  });

  it('posts only valid idempotent invoice returns for sales roles', async () => {
    const saleId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
    const saleLineId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
    const body = { saleId, lines: [{ saleLineId, quantity: '1.0000' }], payments: [{ method: 'CASH', amount: '10.0000' }], reason: 'Wrong size', occurredAt: '2026-01-01T00:00:00.000Z' };
    const returns = { post: async (_organizationId: string, _actorUserId: string, key: string) => key === 'exceeded' ? ({ ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' }) : ({ ok: true as const, salesReturn: { id: '9f112860-9eb3-402f-b722-740616412a85' }, replayed: key === 'replay' }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const warehouseAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'WAREHOUSE' as const } }) };
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, returns);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, returns);
    const warehouse = await buildApp(successIdentity, warehouseAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, returns);

    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/returns', payload: body })).statusCode).toBe(401);
    expect((await warehouse.inject({ method: 'POST', url: '/api/v1/returns', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: body })).statusCode).toBe(403);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/returns', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/returns', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: {} })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/returns', headers: { cookie: 'session=token', 'idempotency-key': 'exceeded' }, payload: body })).statusCode).toBe(409);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/returns', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: body })).statusCode).toBe(201);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/returns', headers: { cookie: 'session=token', 'idempotency-key': 'replay' }, payload: body })).statusCode).toBe(200);
    await Promise.all([cashier.close(), anonymous.close(), warehouse.close()]);
  });

  it('revises a posted invoice return only for sales roles with idempotency', async () => {
    const returnId = '9f112860-9eb3-402f-b722-740616412a85';
    const saleId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
    const saleLineId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
    const body = { saleId, lines: [{ saleLineId, quantity: '1.0000' }], payments: [{ method: 'CASH', amount: '10.0000' }], reason: 'Changed size', occurredAt: '2026-01-01T00:00:00.000Z' };
    const revisions = { revise: async (_organizationId: string, _actorUserId: string, _returnId: string, key: string) => key === 'missing' ? ({ ok: false as const, reason: 'RETURN_NOT_POSTED' }) : ({ ok: true as const, salesReturn: { id: returnId }, replayed: key === 'replay' }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const warehouseAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'WAREHOUSE' as const } }) };
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, revisions);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, revisions);
    const warehouse = await buildApp(successIdentity, warehouseAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, revisions);
    const url = `/api/v1/returns/${returnId}/revise`;
    expect((await anonymous.inject({ method: 'POST', url, payload: body })).statusCode).toBe(401);
    expect((await warehouse.inject({ method: 'POST', url, headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: body })).statusCode).toBe(403);
    expect((await cashier.inject({ method: 'POST', url, headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url, headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: {} })).statusCode).toBe(400);
    expect((await cashier.inject({ method: 'POST', url, headers: { cookie: 'session=token', 'idempotency-key': 'missing' }, payload: body })).statusCode).toBe(409);
    expect((await cashier.inject({ method: 'POST', url, headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: body })).statusCode).toBe(201);
    expect((await cashier.inject({ method: 'POST', url, headers: { cookie: 'session=token', 'idempotency-key': 'replay' }, payload: body })).statusCode).toBe(200);
    await Promise.all([cashier.close(), anonymous.close(), warehouse.close()]);
  });

  it('submits a no-invoice return only for a manager or admin and keeps it pending', async () => {
    const customerId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a';
    const warehouseId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
    const productId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
    const body = { customerId, warehouseId, lines: [{ productId, quantity: '1.0000', unitPrice: '10.0000' }], payments: [{ method: 'CASH', amount: '10.0000' }], reason: 'No receipt', itemCondition: 'Unworn', occurredAt: '2026-01-01T00:00:00.000Z' };
    const pending = { submit: async (_organizationId: string, _actorUserId: string, key: string) => key === 'product' ? ({ ok: false as const, reason: 'PRODUCT_UNAVAILABLE' }) : ({ ok: true as const, salesReturn: { id: '9f112860-9eb3-402f-b722-740616412a85' }, replayed: key === 'replay' }) };
    const managerAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'MANAGER' as const } }) };
    const financeAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'FINANCE' as const } }) };
    const manager = await buildApp(successIdentity, managerAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, pending);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, pending);
    const finance = await buildApp(successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, pending);

    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/returns/no-invoice', payload: body })).statusCode).toBe(401);
    expect((await finance.inject({ method: 'POST', url: '/api/v1/returns/no-invoice', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: body })).statusCode).toBe(403);
    expect((await manager.inject({ method: 'POST', url: '/api/v1/returns/no-invoice', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(400);
    expect((await manager.inject({ method: 'POST', url: '/api/v1/returns/no-invoice', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: {} })).statusCode).toBe(400);
    expect((await manager.inject({ method: 'POST', url: '/api/v1/returns/no-invoice', headers: { cookie: 'session=token', 'idempotency-key': 'product' }, payload: body })).statusCode).toBe(409);
    expect((await manager.inject({ method: 'POST', url: '/api/v1/returns/no-invoice', headers: { cookie: 'session=token', 'idempotency-key': 'key-1' }, payload: body })).statusCode).toBe(201);
    expect((await manager.inject({ method: 'POST', url: '/api/v1/returns/no-invoice', headers: { cookie: 'session=token', 'idempotency-key': 'replay' }, payload: body })).statusCode).toBe(200);
    await Promise.all([manager.close(), anonymous.close(), finance.close()]);
  });

  it('allows Finance or Admin to approve a pending no-invoice return', async () => {
    const returnId = '9f112860-9eb3-402f-b722-740616412a85';
    const queuedReturn = { id: returnId, organizationId: input.organizationId, customerId: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', warehouseId: 'a0ac2c74-c66c-4a28-b658-34c88db36e8a', actorUserId: registeredUser.id, reason: 'No receipt', total: '10.0000', status: 'PENDING_APPROVAL' as const, occurredAt: new Date('2026-01-01T00:00:00.000Z') };
    const approvals = { listPending: async () => [queuedReturn], approve: async (_organizationId: string, _financeUserId: string, id: string) => id === 'missing' ? ({ ok: false as const, reason: 'RETURN_NOT_PENDING' }) : ({ ok: true as const, salesReturn: { id } }) };
    const financeAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'FINANCE' as const } }) };
    const managerAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'MANAGER' as const } }) };
    const finance = await buildApp(successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, approvals);
    const manager = await buildApp(successIdentity, managerAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, approvals);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, approvals);

    expect((await anonymous.inject({ method: 'POST', url: `/api/v1/returns/${returnId}/approve` })).statusCode).toBe(401);
    expect((await manager.inject({ method: 'POST', url: `/api/v1/returns/${returnId}/approve`, headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/returns/no-invoice/pending' })).statusCode).toBe(401);
    expect((await manager.inject({ method: 'GET', url: '/api/v1/returns/no-invoice/pending', headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await finance.inject({ method: 'GET', url: '/api/v1/returns/no-invoice/pending', headers: { cookie: 'session=token' } })).json()).toEqual({ returns: [{ ...queuedReturn, occurredAt: queuedReturn.occurredAt.toISOString() }] });
    expect((await finance.inject({ method: 'POST', url: '/api/v1/returns/missing/approve', headers: { cookie: 'session=token' } })).statusCode).toBe(409);
    expect((await finance.inject({ method: 'POST', url: `/api/v1/returns/${returnId}/approve`, headers: { cookie: 'session=token' } })).json()).toEqual({ id: returnId });
    await Promise.all([finance.close(), manager.close(), anonymous.close()]);
  });

  it('posts validated idempotent expenses only for Finance or Admin', async () => {
    const body = { category: 'Utilities', description: 'Electricity bill', paymentMethod: 'CASH' as const, amount: '250.5000', occurredAt: '2026-01-01T00:00:00.000Z' };
    const expense = { id: '9f112860-9eb3-402f-b722-740616412a85', organizationId: input.organizationId, ...body, occurredAt: new Date(body.occurredAt) };
    const expenses = { post: async (_organizationId: string, _actorUserId: string, key: string) => ({ ok: true as const, expense, replayed: key === 'replay' }) };
    const financeAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'FINANCE' as const } }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const finance = await buildApp(successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, expenses);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, expenses);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, expenses);

    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/expenses', payload: body })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/expenses', headers: { cookie: 'session=token', 'idempotency-key': 'expense-1' }, payload: body })).statusCode).toBe(403);
    expect((await finance.inject({ method: 'POST', url: '/api/v1/expenses', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(400);
    expect((await finance.inject({ method: 'POST', url: '/api/v1/expenses', headers: { cookie: 'session=token', 'idempotency-key': 'expense-1' }, payload: {} })).statusCode).toBe(400);
    expect((await finance.inject({ method: 'POST', url: '/api/v1/expenses', headers: { cookie: 'session=token', 'idempotency-key': 'expense-1' }, payload: body })).statusCode).toBe(201);
    expect((await finance.inject({ method: 'POST', url: '/api/v1/expenses', headers: { cookie: 'session=token', 'idempotency-key': 'replay' }, payload: body })).statusCode).toBe(200);
    await Promise.all([finance.close(), cashier.close(), anonymous.close()]);
  });

  it('lists and creates suppliers only for purchasing roles', async () => {
    const supplier = { id: '9f112860-9eb3-402f-b722-740616412a85', organizationId: input.organizationId, name: 'Textile Importers', phone: '01012345678', email: 'orders@example.test', address: 'Cairo', notes: 'Net 30', active: true, version: 1 };
    const suppliers = { list: async () => [supplier], create: async () => ({ ok: true as const, supplier }) };
    const warehouseAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'WAREHOUSE' as const } }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const warehouse = await buildApp(successIdentity, warehouseAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, suppliers);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, suppliers);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, suppliers);
    const body = { name: supplier.name, phone: supplier.phone, email: supplier.email, address: supplier.address, notes: supplier.notes };

    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/suppliers' })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/suppliers', headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await warehouse.inject({ method: 'GET', url: '/api/v1/suppliers', headers: { cookie: 'session=token' } })).json()).toEqual({ suppliers: [supplier] });
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/suppliers', payload: body })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'POST', url: '/api/v1/suppliers', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(403);
    expect((await warehouse.inject({ method: 'POST', url: '/api/v1/suppliers', headers: { cookie: 'session=token' }, payload: {} })).statusCode).toBe(400);
    expect((await warehouse.inject({ method: 'POST', url: '/api/v1/suppliers', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(201);
    await Promise.all([warehouse.close(), cashier.close(), anonymous.close()]);
  });
});
