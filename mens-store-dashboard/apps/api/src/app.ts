import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { createCategorySchema, createCustomerSchema, createInvoiceReturnSchema, createInventoryMovementSchema, createNoInvoiceReturnSchema, createProductSchema, createSaleSchema, createUserSchema, createWarehouseSchema, healthResponseSchema, loginSchema, registerUserSchema, stockQuerySchema, type Category, type CreateCategoryInput, type CreateCustomerInput, type CreateInvoiceReturnInput, type CreateInventoryMovementInput, type CreateNoInvoiceReturnInput, type CreateProductInput, type CreateSaleInput, type CreateWarehouseInput, type Customer, type InventoryMovement, type Product, type PublicUser, type Warehouse } from '@ahmed-store/contracts';
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

export interface CategoryService {
  list(organizationId: string): Promise<Category[]>;
  create(organizationId: string, input: CreateCategoryInput): Promise<{ ok: true; category: Category } | { ok: false; reason: 'CATEGORY_EXISTS' }>;
}

export interface ProductService {
  list(organizationId: string): Promise<Product[]>;
  create(organizationId: string, input: CreateProductInput): Promise<{ ok: true; product: Product } | { ok: false; reason: 'SKU_EXISTS' | 'BARCODE_EXISTS' | 'CATEGORY_UNAVAILABLE' }>;
}

export interface WarehouseService {
  list(organizationId: string): Promise<Warehouse[]>;
  create(organizationId: string, input: CreateWarehouseInput): Promise<{ ok: true; warehouse: Warehouse } | { ok: false; reason: 'WAREHOUSE_EXISTS' }>;
}

export interface StockService {
  quantityAsOf(organizationId: string, productId: string, asOf: Date, warehouseId?: string): Promise<string>;
}

export interface InventoryMovementService {
  post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateInventoryMovementInput): Promise<{ ok: true; movement: InventoryMovement; replayed: boolean } | { ok: false; reason: 'PRODUCT_UNAVAILABLE' | 'WAREHOUSE_UNAVAILABLE' }>;
}

export interface CustomerService {
  list(organizationId: string): Promise<Customer[]>;
  create(organizationId: string, input: CreateCustomerInput): Promise<{ ok: true; customer: Customer }>;
}

export interface SalesService {
  post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateSaleInput): Promise<{ ok: true; sale: { id: string }; replayed: boolean } | { ok: false; reason: string }>;
}

export interface InvoiceReturnService {
  post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateInvoiceReturnInput): Promise<{ ok: true; salesReturn: { id: string }; replayed: boolean } | { ok: false; reason: string }>;
}

export interface NoInvoiceReturnService {
  submit(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateNoInvoiceReturnInput): Promise<{ ok: true; salesReturn: { id: string }; replayed: boolean } | { ok: false; reason: string }>;
}

export interface NoInvoiceApprovalService {
  listPending(organizationId: string): Promise<Array<{ id: string; organizationId: string; customerId: string; warehouseId: string; actorUserId: string; reason: string; total: string; status: 'PENDING_APPROVAL'; occurredAt: Date }>>;
  approve(organizationId: string, financeUserId: string, returnId: string): Promise<{ ok: true; salesReturn: { id: string } } | { ok: false; reason: string }>;
}

export interface ShiftTotalsService {
  summarize(organizationId: string, openedAt: Date, closedAt: Date): Promise<{ ok: true; totals: { receipts: string; refunds: string; net: string; methods: Array<{ method: string; receipts: string; refunds: string; net: string }> } } | { ok: false; reason: 'INVALID_SHIFT_PERIOD' }>;
}

function readSessionToken(cookie: string | undefined) {
  return cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('session='))?.slice('session='.length);
}

function sessionCookie(token: string, expired = false) {
  const age = expired ? 0 : 8 * 60 * 60;
  return `session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}`;
}

export async function buildApp(identityService: IdentityService, authenticationService: AuthenticationService, userDirectoryService: UserDirectoryService, categoryService: CategoryService, productService: ProductService, warehouseService: WarehouseService, stockService: StockService, inventoryMovementService: InventoryMovementService, customerService: CustomerService, salesService: SalesService, invoiceReturnService?: InvoiceReturnService, noInvoiceReturnService?: NoInvoiceReturnService, noInvoiceApprovalService?: NoInvoiceApprovalService, shiftTotalsService?: ShiftTotalsService) {
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

  app.get('/api/v1/categories', { schema: { summary: 'List active product categories', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { categories: await categoryService.list(authenticated.user.organizationId) };
  });

  app.post('/api/v1/categories', { schema: { summary: 'Create a product category', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = createCategorySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_CATEGORY' });
    const result = await categoryService.create(authenticated.user.organizationId, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(201).send(result.category);
  });

  app.get('/api/v1/products', { schema: { summary: 'List organization products', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { products: await productService.list(authenticated.user.organizationId) };
  });

  app.post('/api/v1/products', { schema: { summary: 'Create an organization product', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_PRODUCT' });
    const result = await productService.create(authenticated.user.organizationId, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(201).send(result.product);
  });

  app.get('/api/v1/warehouses', { schema: { summary: 'List organization warehouses', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { warehouses: await warehouseService.list(authenticated.user.organizationId) };
  });

  app.post('/api/v1/warehouses', { schema: { summary: 'Create an organization warehouse', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = createWarehouseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_WAREHOUSE' });
    const result = await warehouseService.create(authenticated.user.organizationId, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(201).send(result.warehouse);
  });

  app.get('/api/v1/inventory/stock', { schema: { summary: 'Get stock at a historical point in time', tags: ['Inventory'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = stockQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_STOCK_QUERY' });
    return { quantity: await stockService.quantityAsOf(authenticated.user.organizationId, parsed.data.productId, parsed.data.asOf, parsed.data.warehouseId) };
  });

  app.post('/api/v1/inventory/movements', { schema: { summary: 'Post an immutable opening-balance or adjustment movement', tags: ['Inventory'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    const parsed = createInventoryMovementSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INVENTORY_MOVEMENT' });
    const result = await inventoryMovementService.post(authenticated.user.organizationId, authenticated.user.id, idempotencyKey, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(result.replayed ? 200 : 201).send(result.movement);
  });

  app.get('/api/v1/finance/shift-totals', { schema: { summary: 'Calculate shift totals from posted treasury movements', tags: ['Finance'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'treasury:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const query = request.query as { openedAt?: string; closedAt?: string };
    const openedAt = new Date(query.openedAt ?? '');
    const closedAt = new Date(query.closedAt ?? '');
    if (Number.isNaN(openedAt.getTime()) || Number.isNaN(closedAt.getTime())) return reply.code(400).send({ error: 'INVALID_SHIFT_PERIOD' });
    const result = await shiftTotalsService!.summarize(authenticated.user.organizationId, openedAt, closedAt);
    if (!result.ok) return reply.code(400).send({ error: result.reason });
    return result.totals;
  });

  app.get('/api/v1/customers', { schema: { summary: 'List active organization customers', tags: ['Customers'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'sales:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { customers: await customerService.list(authenticated.user.organizationId) };
  });

  app.post('/api/v1/customers', { schema: { summary: 'Create an organization customer', tags: ['Customers'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'sales:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_CUSTOMER' });
    const result = await customerService.create(authenticated.user.organizationId, parsed.data);
    return reply.code(201).send(result.customer);
  });

  app.post('/api/v1/sales', { schema: { summary: 'Post an atomic sale with payments and stock issue movements', tags: ['Sales'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'sales:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    const parsed = createSaleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_SALE' });
    const result = await salesService.post(authenticated.user.organizationId, authenticated.user.id, idempotencyKey, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(result.replayed ? 200 : 201).send(result.sale);
  });

  app.post('/api/v1/returns', { schema: { summary: 'Post an atomic invoice-linked return with refund and stock restoration', tags: ['Sales'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'sales:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    const parsed = createInvoiceReturnSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_RETURN' });
    const result = await invoiceReturnService!.post(authenticated.user.organizationId, authenticated.user.id, idempotencyKey, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(result.replayed ? 200 : 201).send(result.salesReturn);
  });

  app.post('/api/v1/returns/no-invoice', { schema: { summary: 'Submit a manager-valued no-invoice return for Finance approval', tags: ['Sales'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'returns:submit_no_invoice')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    const parsed = createNoInvoiceReturnSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_NO_INVOICE_RETURN' });
    const result = await noInvoiceReturnService!.submit(authenticated.user.organizationId, authenticated.user.id, idempotencyKey, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(result.replayed ? 200 : 201).send(result.salesReturn);
  });

  app.get('/api/v1/returns/no-invoice/pending', { schema: { summary: 'List no-invoice returns awaiting Finance approval', tags: ['Sales'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'returns:approve_no_invoice')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { returns: await noInvoiceApprovalService!.listPending(authenticated.user.organizationId) };
  });

  app.post('/api/v1/returns/:returnId/approve', { schema: { summary: 'Approve and post a pending no-invoice return', tags: ['Sales'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'returns:approve_no_invoice')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { returnId } = request.params as { returnId: string };
    const result = await noInvoiceApprovalService!.approve(authenticated.user.organizationId, authenticated.user.id, returnId);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return result.salesReturn;
  });

  return app;
}
