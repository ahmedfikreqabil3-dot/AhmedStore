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
const successIdentity = { register: async () => ({ ok: true as const, user: registeredUser }), auditUserCreated: async () => undefined };

describe('API health endpoint', () => {
  it('returns the versioned API health response', async () => {
    const app = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService);
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
    const app = await buildApp(successIdentity, auth, userDirectoryService, categoryService, productService, warehouseService, stockService);
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
    const app = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { organizationId: input.organizationId, email: input.email, password: 'a-secure-password' } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('enforces authentication and the users-manage permission for tenant-scoped users', async () => {
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) };
    const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const identity = successIdentity;
    const anonymous = await buildApp(identity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService);
    const cashier = await buildApp(identity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService);
    const admin = await buildApp(identity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/users' })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: 'session=token' } })).json()).toEqual({ users: [registeredUser] });
    await Promise.all([anonymous.close(), cashier.close(), admin.close()]);
  });

  it('allows only an admin to create a user in their own organization and writes an audit event', async () => {
    let audited = false;
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) };
    const identity = { ...successIdentity, auditUserCreated: async () => { audited = true; } };
    const app = await buildApp(identity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService);
    const anonymous = await buildApp(identity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService);
    const cashier = await buildApp(identity, { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) }, userDirectoryService, categoryService, productService, warehouseService, stockService);
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
    const admin = await buildApp(successIdentity, adminAuth, userDirectoryService, catalogue, productService, warehouseService, stockService);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, catalogue, productService, warehouseService, stockService);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, catalogue, productService, warehouseService, stockService);
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
    const admin = await buildApp(successIdentity, adminAuth, userDirectoryService, categoryService, products, warehouses, stockService);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, products, warehouses, stockService);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, products, warehouses, stockService);
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
    const admin = await buildApp(successIdentity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stock);
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stock);
    const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stock);
    const query = `productId=${productId}&warehouseId=${warehouseId}&asOf=2026-01-01T00:00:00.000Z`;

    expect((await anonymous.inject({ method: 'GET', url: `/api/v1/inventory/stock?${query}` })).statusCode).toBe(401);
    expect((await cashier.inject({ method: 'GET', url: `/api/v1/inventory/stock?${query}`, headers: { cookie: 'session=token' } })).statusCode).toBe(403);
    expect((await admin.inject({ method: 'GET', url: '/api/v1/inventory/stock', headers: { cookie: 'session=token' } })).statusCode).toBe(400);
    expect((await admin.inject({ method: 'GET', url: `/api/v1/inventory/stock?${query}`, headers: { cookie: 'session=token' } })).json()).toEqual({ quantity: '7.2500' });
    expect(received).toEqual([input.organizationId, productId, new Date('2026-01-01T00:00:00.000Z'), warehouseId]);
    await Promise.all([admin.close(), anonymous.close(), cashier.close()]);
  });
});
