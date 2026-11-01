import { createInventoryTransferSchema, inventoryTransferQuerySchema } from '@ahmed-store/contracts';
import { publicError } from './modules/shared/public-error.js';
import { customerSchema, partyStatementQuerySchema, type PartyStatement, type PartyStatementQuery } from '@ahmed-store/contracts';
import { expenseHistoryQuerySchema, type ExpenseHistory, type ExpenseHistoryQuery } from '@ahmed-store/contracts';
import { partyDirectoryQuerySchema,partyLifecycleSchema,type PartyDirectoryQuery,type PartyDirectoryResult,type PartyLifecycleInput } from '@ahmed-store/contracts';
import {mayManageParty,type PartyLifecycleResult} from './modules/parties/lifecycle.js';
import {registerCustomerImportRoutes} from './modules/parties/customer-import-routes.js';
import type {createCustomerImportService} from './modules/parties/customer-import.js';
import type { createInventoryTransferService } from './modules/inventory/transfer.js';
import type { createStockCountService } from './modules/inventory/count.js';
import type { createStockThresholdService } from './modules/inventory/threshold.js';
import { setStockThresholdSchema, stockThresholdQuerySchema } from '@ahmed-store/contracts';
import { createStockCountSchema, stockCountQuerySchema } from '@ahmed-store/contracts';
import { updateCustomerSchema, updateSupplierSchema, type UpdateCustomerInput, type UpdateSupplierInput } from '@ahmed-store/contracts';
import type { PartyUpdateResult } from './modules/parties/update.js';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { createCategorySchema, createCustomerSchema, createExpenseSchema, createInvoiceReturnSchema, createInventoryMovementSchema, createNoInvoiceReturnSchema, createProductSchema, productSchema, updateProductSchema, createPurchaseReturnSchema, createPurchaseSchema, createSaleSchema, createSupplierSchema, createUserSchema, createWarehouseSchema, healthResponseSchema, loginSchema, registerUserSchema, salesExportQuerySchema, salesHistoryQuerySchema, stockQuerySchema, type Category, type CreateCategoryInput, type CreateCustomerInput, type CreateExpenseInput, type CreateInvoiceReturnInput, type CreateInventoryMovementInput, type CreateNoInvoiceReturnInput, type CreateProductInput, type CreatePurchaseInput, type CreateSaleInput, type CreateSupplierInput, type CreateWarehouseInput, type Customer, type InventoryMovement, type PaymentMethod, type Product, type PublicUser, type SalesHistoryQuery, type Supplier, type Warehouse } from '@ahmed-store/contracts';
import { can } from './modules/identity/authorization.js';
import type { ProductUpdateResult } from './modules/catalogue/product-update.js';
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
export interface CategoryImportService { template(): Promise<Buffer>; preview(file: Buffer): Promise<{ valid: boolean; rows: Array<{ row: number; name: string }>; errors: Array<{ row: number; message: string }> }>; import(organizationId: string, actorUserId: string, file: Buffer): Promise<{ ok: true; imported: number } | { ok: false; preview: { valid: boolean; rows: Array<{ row: number; name: string }>; errors: Array<{ row: number; message: string }> } }>; }
export interface ProductImportService { template(): Promise<Buffer>; preview(file: Buffer): Promise<{ valid: boolean; rows: unknown[]; errors: Array<{ row: number; message: string }> }>; import(organizationId: string, actorUserId: string, file: Buffer): Promise<{ ok: true; imported: number } | { ok: false; preview: { valid: boolean; rows: unknown[]; errors: Array<{ row: number; message: string }> } }>; }
export interface SupplierImportService { template(): Promise<Buffer>; preview(file: Buffer): Promise<{ valid: boolean; rows: unknown[]; errors: Array<{ row: number; message: string }> }>; import(organizationId: string, actorUserId: string, file: Buffer): Promise<{ ok: true; imported: number } | { ok: false; preview: { valid: boolean; rows: unknown[]; errors: Array<{ row: number; message: string }> } }>; }

export interface ProductService {
  list(organizationId: string): Promise<Product[]>;
  update?(organizationId: string, actorUserId: string, productId: string, input: ReturnType<typeof updateProductSchema.parse>): Promise<ProductUpdateResult>;
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
  post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateInventoryMovementInput): Promise<import('./modules/inventory/movement.js').PostInventoryMovementResult>;
}

export interface CustomerService {
  imports?:ReturnType<typeof createCustomerImportService>;
  directory?(organizationId:string,query:PartyDirectoryQuery):Promise<PartyDirectoryResult>;
  lifecycle?(organizationId:string,actorUserId:string,id:string,input:PartyLifecycleInput):Promise<PartyLifecycleResult>;
  statement?(organizationId:string,partyId:string,query:PartyStatementQuery):Promise<PartyStatement|null>;
  update?(organizationId:string,actorUserId:string,id:string,input:UpdateCustomerInput):Promise<PartyUpdateResult<Customer>>;
  list(organizationId: string): Promise<Customer[]>;
  create(organizationId: string, input: CreateCustomerInput): Promise<{ ok: true; customer: Customer }>;
}

export interface SupplierService {
  directory?(organizationId:string,query:PartyDirectoryQuery):Promise<PartyDirectoryResult>;
  lifecycle?(organizationId:string,actorUserId:string,id:string,input:PartyLifecycleInput):Promise<PartyLifecycleResult>;
  statement?(organizationId:string,partyId:string,query:PartyStatementQuery):Promise<PartyStatement|null>;
  update?(organizationId:string,actorUserId:string,id:string,input:UpdateSupplierInput):Promise<PartyUpdateResult<Supplier>>;
  list(organizationId: string): Promise<Supplier[]>;
  create(organizationId: string, input: CreateSupplierInput): Promise<{ ok: true; supplier: Supplier }>;
}
export interface PurchaseService {
  post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreatePurchaseInput): Promise<{ ok: true; purchase: { id: string }; replayed: boolean } | { ok: false; reason: string }>;
  list?(organizationId: string): Promise<Array<{ id: string; supplierId: string; warehouseId: string; status: 'POSTED' | 'VOIDED'; total: string; occurredAt: Date }>>;
  find?(organizationId: string, purchaseId: string): Promise<{ id: string; supplierId: string; warehouseId: string; status: 'POSTED' | 'VOIDED'; total: string; occurredAt: Date; lines: Array<{ id: string; lineNumber: number; productId: string; productName: string; sku: string; barcode: string | null; quantity: string; unitCost: string; total: string }> } | null>;
}
export interface PurchaseReturnService {
  post(organizationId: string, actorUserId: string, idempotencyKey: string, input: ReturnType<typeof createPurchaseReturnSchema.parse>): Promise<{ ok: true; purchaseReturn: { id: string; purchaseId: string; total: string }; replayed: boolean } | { ok: false; reason: string }>;
}
export interface PurchaseRevisionService {
  revise(organizationId: string, actorUserId: string, purchaseId: string, idempotencyKey: string, input: CreatePurchaseInput): Promise<{ ok: true; purchase: { id: string }; replayed: boolean } | { ok: false; reason: string }>;
}
export interface SalesExportService { exportCsv(organizationId: string, actorUserId: string, query: ReturnType<typeof salesExportQuerySchema.parse>): Promise<string>; exportXlsx?(organizationId: string, actorUserId: string, query: ReturnType<typeof salesExportQuerySchema.parse>): Promise<Buffer>; }
export interface SalesHistoryService { list(organizationId: string, query: SalesHistoryQuery): Promise<{ sales: Array<{ id: string; customerName: string; warehouseName: string; total: string; status: 'POSTED' | 'VOIDED'; occurredAt: Date }>; total: number; limit: number; offset: number }>; }

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

export interface ShiftService {
  open(organizationId: string, userId: string, openedAt: Date): Promise<{ ok: true; shift: ShiftResponse } | { ok: false; reason: 'SHIFT_ALREADY_OPEN' | 'ACTOR_UNAVAILABLE' }>;
  current(organizationId: string, userId: string): Promise<ShiftResponse | null>;
  close(organizationId: string, userId: string, shiftId: string, closedAt: Date, countedCash: string, discrepancyReason: string | null): Promise<{ ok: true; shift: ShiftResponse | null } | { ok: false; reason: 'SHIFT_NOT_FOUND' | 'SHIFT_NOT_OWNED' | 'SHIFT_NOT_OPEN' | 'INVALID_SHIFT_PERIOD' | 'CASH_DISCREPANCY_REASON_REQUIRED' }>;
  review(organizationId: string, reviewerUserId: string, shiftId: string, reviewedAt: Date): Promise<{ ok: true; shift: ShiftResponse | null } | { ok: false; reason: 'SHIFT_NOT_FOUND' | 'SHIFT_NOT_CLOSED' }>;
  summary(organizationId: string, requesterUserId: string, canReview: boolean, shiftId: string, now: Date): Promise<{ ok: true; shift: ShiftResponse; totals: { receipts: string; refunds: string; net: string; methods: Array<{ method: string; receipts: string; refunds: string; net: string }> } } | { ok: false; reason: 'SHIFT_NOT_FOUND' | 'INVALID_SHIFT_PERIOD' | 'FORBIDDEN' }>;
  listClosed(organizationId: string): Promise<ShiftResponse[]>;
}

export type ShiftResponse = { id: string; organizationId: string; userId: string; status: 'OPEN' | 'CLOSED' | 'REVIEWED'; openedAt: Date; closedAt: Date | null; closedByUserId: string | null; expectedCash: string | null; countedCash: string | null; cashDifference: string | null; discrepancyReason: string | null; reviewedAt: Date | null; reviewedByUserId: string | null };

export interface ReturnRevisionService {
  revise(organizationId: string, actorUserId: string, returnId: string, idempotencyKey: string, input: CreateInvoiceReturnInput): Promise<{ ok: true; salesReturn: { id: string }; replayed: boolean } | { ok: false; reason: string }>;
}

export interface ExpenseService {
  list?(organizationId:string,query:ExpenseHistoryQuery):Promise<ExpenseHistory>;
  post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateExpenseInput): Promise<{ ok: true; expense: { id: string; organizationId: string; category: string; description: string; paymentMethod: PaymentMethod; amount: string; occurredAt: Date }; replayed: boolean }|{ok:false;reason:string}>;
}

function readSessionToken(cookie: string | undefined) {
  return cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('session='))?.slice('session='.length);
}

function sessionCookie(token: string, expired = false) {
  const age = expired ? 0 : 8 * 60 * 60;
  return `session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}`;
}

function parseShiftClose(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const { countedCash, discrepancyReason } = body as { countedCash?: unknown; discrepancyReason?: unknown };
  if (typeof countedCash !== 'string' || !/^\d+(?:\.\d{1,4})?$/.test(countedCash)) return null;
  if (discrepancyReason !== undefined && (typeof discrepancyReason !== 'string' || !discrepancyReason.trim() || discrepancyReason.length > 1000)) return null;
  return { countedCash, discrepancyReason: typeof discrepancyReason === 'string' ? discrepancyReason.trim() : null };
}

export async function buildApp(identityService: IdentityService, authenticationService: AuthenticationService, userDirectoryService: UserDirectoryService, categoryService: CategoryService, productService: ProductService, warehouseService: WarehouseService, stockService: StockService, inventoryMovementService: InventoryMovementService, customerService: CustomerService, salesService: SalesService, invoiceReturnService?: InvoiceReturnService, noInvoiceReturnService?: NoInvoiceReturnService, noInvoiceApprovalService?: NoInvoiceApprovalService, shiftTotalsService?: ShiftTotalsService, returnRevisionService?: ReturnRevisionService, shiftService?: ShiftService, expenseService?: ExpenseService, supplierService?: SupplierService, purchaseService?: PurchaseService, purchaseReturnService?: PurchaseReturnService, purchaseRevisionService?: PurchaseRevisionService, salesExportService?: SalesExportService, salesHistoryService?: SalesHistoryService, categoryImportService?: CategoryImportService, productImportService?: ProductImportService, supplierImportService?: SupplierImportService, inventoryTransferService?: ReturnType<typeof createInventoryTransferService>, stockCountService?: ReturnType<typeof createStockCountService>, stockThresholdService?: ReturnType<typeof createStockThresholdService>) {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error,request,reply)=>{const safe=publicError(error,request.id);return reply.code(safe.statusCode).send(safe.body);});
  app.addContentTypeParser('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  registerCustomerImportRoutes(app,{authenticate:request=>authenticationService.authenticate(readSessionToken(request.headers.cookie)),service:customerService.imports});

  await app.register(swagger, {
    openapi: {
      info: { title: 'Ahmed Store API', version: '1.0.0', description: 'Organization-scoped retail operations API.' },
      servers: [{ url: '/api/v1', description: 'Current server' }]
    }
  });

  app.get('/api/v1/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  app.get('/api/v1/health', { schema: { summary: 'Service health check', tags: ['System'] } }, async () => healthResponseSchema.parse({ status: 'ok', service: 'api' }));

  app.get('/api/v1/expenses',async(request,reply)=>{
    const auth=await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if(!auth.ok)return reply.code(401).send({error:auth.reason});
    if(!can(auth.user.role,'expenses:manage'))return reply.code(403).send({error:'FORBIDDEN'});
    const parsed=expenseHistoryQuerySchema.safeParse(request.query);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_EXPENSE_QUERY'});
    if(!expenseService?.list)return reply.code(503).send({error:'SERVICE_UNAVAILABLE'});
    return expenseService.list(auth.user.organizationId,parsed.data);
  });

  for(const kind of ['customers','suppliers'] as const){
    app.get(`/api/v1/${kind}/directory`,async(request,reply)=>{
      const auth=await authenticationService.authenticate(readSessionToken(request.headers.cookie));
      if(!auth.ok)return reply.code(401).send({error:auth.reason});
      if(!mayManageParty(auth.user.role,kind))return reply.code(403).send({error:'FORBIDDEN'});
      const parsed=partyDirectoryQuerySchema.safeParse(request.query);
      if(!parsed.success)return reply.code(400).send({error:'INVALID_DIRECTORY_QUERY'});
      const service=kind==='customers'?customerService:supplierService;
      if(!service?.directory)return reply.code(503).send({error:'SERVICE_UNAVAILABLE'});
      return service.directory(auth.user.organizationId,parsed.data);
    });
    app.patch(`/api/v1/${kind}/:partyId/lifecycle`,async(request,reply)=>{
      const auth=await authenticationService.authenticate(readSessionToken(request.headers.cookie));
      if(!auth.ok)return reply.code(401).send({error:auth.reason});
      if(!mayManageParty(auth.user.role,kind))return reply.code(403).send({error:'FORBIDDEN'});
      const id=(request.params as {partyId:string}).partyId,parsed=partyLifecycleSchema.safeParse(request.body);
      if(!customerSchema.shape.id.safeParse(id).success||!parsed.success)return reply.code(400).send({error:'INVALID_PARTY_LIFECYCLE'});
      const service=kind==='customers'?customerService:supplierService;
      if(!service?.lifecycle)return reply.code(503).send({error:'SERVICE_UNAVAILABLE'});
      const result=await service.lifecycle(auth.user.organizationId,auth.user.id,id,parsed.data);
      if(!result.ok)return reply.code(result.reason==='PARTY_NOT_FOUND'?404:409).send({error:result.reason});
      return result.party;
    });
    app.get(`/api/v1/${kind}/:partyId/statement`,async(request,reply)=>{
      const auth=await authenticationService.authenticate(readSessionToken(request.headers.cookie));
      if(!auth.ok)return reply.code(401).send({error:auth.reason});
      const permission=kind==='customers' ? 'sales:write' : 'purchases:manage';
      if(!can(auth.user.role,permission)&&!can(auth.user.role,'reports:read'))return reply.code(403).send({error:'FORBIDDEN'});
      const partyId=(request.params as {partyId:string}).partyId;
      const parsed=partyStatementQuerySchema.safeParse(request.query);
      if(!customerSchema.shape.id.safeParse(partyId).success||!parsed.success)return reply.code(400).send({error:'INVALID_STATEMENT_QUERY'});
      const service=kind==='customers' ? customerService : supplierService;
      if(!service?.statement)return reply.code(503).send({error:'SERVICE_UNAVAILABLE'});
      const statement=await service.statement(auth.user.organizationId,partyId,parsed.data);
      if(!statement)return reply.code(404).send({error:'PARTY_NOT_FOUND'});
      return statement;
    });
  }

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

  app.get('/api/v1/categories/import-template.xlsx', { schema: { summary: 'Download the category import template', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    if (!categoryImportService) return reply.code(503).send({ error: 'CATEGORY_IMPORT_UNAVAILABLE' });
    return reply.header('content-disposition', 'attachment; filename="category-import-template.xlsx"').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await categoryImportService.template());
  });

  app.post('/api/v1/categories/import.xlsx/preview', { schema: { summary: 'Validate a category import workbook without changing data', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    if (!categoryImportService) return reply.code(503).send({ error: 'CATEGORY_IMPORT_UNAVAILABLE' });
    if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'INVALID_IMPORT_FILE' });
    return categoryImportService.preview(request.body);
  });

  app.post('/api/v1/categories/import.xlsx', { schema: { summary: 'Atomically import validated category rows', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    if (!categoryImportService) return reply.code(503).send({ error: 'CATEGORY_IMPORT_UNAVAILABLE' });
    if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'INVALID_IMPORT_FILE' });
    const result = await categoryImportService.import(authenticated.user.organizationId, authenticated.user.id, request.body);
    return result.ok ? reply.code(201).send(result) : reply.code(422).send(result);
  });

  app.get('/api/v1/products', { schema: { summary: 'List organization products', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { products: await productService.list(authenticated.user.organizationId) };
  });

  app.patch('/api/v1/products/:productId', { schema: { summary: 'Update product details with optimistic concurrency and audit', tags: ['Catalogue'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { productId } = request.params as { productId: string };
    const parsed = updateProductSchema.safeParse(request.body);
    if (!productSchema.shape.id.safeParse(productId).success || !parsed.success) return reply.code(400).send({ error: 'INVALID_PRODUCT' });
    if (!productService.update) return reply.code(503).send({ error: 'PRODUCT_UPDATE_UNAVAILABLE' });
    const result = await productService.update(authenticated.user.organizationId, authenticated.user.id, productId, parsed.data);
    if (!result.ok) return reply.code(result.reason === 'PRODUCT_NOT_FOUND' ? 404 : 409).send({ error: result.reason });
    return result.product;
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

  app.get('/api/v1/products/import-template.xlsx', async (request, reply) => { const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie)); if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason }); if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' }); if (!productImportService) return reply.code(503).send({ error: 'PRODUCT_IMPORT_UNAVAILABLE' }); return reply.header('content-disposition', 'attachment; filename="product-import-template.xlsx"').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await productImportService.template()); });
  app.post('/api/v1/products/import.xlsx/preview', async (request, reply) => { const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie)); if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason }); if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' }); if (!productImportService) return reply.code(503).send({ error: 'PRODUCT_IMPORT_UNAVAILABLE' }); if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'INVALID_IMPORT_FILE' }); return productImportService.preview(request.body); });
  app.post('/api/v1/products/import.xlsx', async (request, reply) => { const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie)); if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason }); if (!can(authenticated.user.role, 'inventory:write')) return reply.code(403).send({ error: 'FORBIDDEN' }); if (!productImportService) return reply.code(503).send({ error: 'PRODUCT_IMPORT_UNAVAILABLE' }); if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'INVALID_IMPORT_FILE' }); const result = await productImportService.import(authenticated.user.organizationId, authenticated.user.id, request.body); return result.ok ? reply.code(201).send(result) : reply.code(422).send(result); });

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

  app.post('/api/v1/expenses', { schema: { summary: 'Post an immutable expense and matching treasury outflow', tags: ['Finance'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'expenses:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    if(!expenseService)return reply.code(503).send({error:'EXPENSE_SERVICE_UNAVAILABLE'});
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    const parsed = createExpenseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_EXPENSE' });
    const result = await expenseService.post(authenticated.user.organizationId, authenticated.user.id, idempotencyKey, parsed.data);
    if(!result.ok)return reply.code(409).send({error:result.reason});
    return reply.code(result.replayed ? 200 : 201).send(result.expense);
  });

  app.post('/api/v1/shifts/open', { schema: { summary: 'Open the authenticated user’s cash shift', tags: ['Shifts'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'shifts:manage_own')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const result = await shiftService!.open(authenticated.user.organizationId, authenticated.user.id, new Date());
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(201).send(result.shift);
  });

  app.get('/api/v1/shifts/current', { schema: { summary: 'Get the authenticated user’s open shift', tags: ['Shifts'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'shifts:manage_own')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { shift: await shiftService!.current(authenticated.user.organizationId, authenticated.user.id) };
  });

  app.post('/api/v1/shifts/:shiftId/close', { schema: { summary: 'Close the authenticated user’s open shift', tags: ['Shifts'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'shifts:manage_own')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = parseShiftClose(request.body);
    if (!parsed) return reply.code(400).send({ error: 'INVALID_SHIFT_CLOSING' });
    const { shiftId } = request.params as { shiftId: string };
    const result = await shiftService!.close(authenticated.user.organizationId, authenticated.user.id, shiftId, new Date(), parsed.countedCash, parsed.discrepancyReason);
    if (!result.ok) return reply.code(result.reason === 'SHIFT_NOT_FOUND' ? 404 : 409).send({ error: result.reason });
    return result.shift;
  });

  app.get('/api/v1/shifts/:shiftId/summary', { schema: { summary: 'Get a shift’s ledger-derived totals', tags: ['Shifts'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    const { shiftId } = request.params as { shiftId: string };
    const result = await shiftService!.summary(authenticated.user.organizationId, authenticated.user.id, can(authenticated.user.role, 'shifts:review'), shiftId, new Date());
    if (!result.ok) return reply.code(result.reason === 'SHIFT_NOT_FOUND' ? 404 : result.reason === 'FORBIDDEN' ? 403 : 409).send({ error: result.reason });
    return { shift: result.shift, totals: result.totals };
  });

  app.get('/api/v1/shifts', { schema: { summary: 'List closed shifts awaiting or completing finance review', tags: ['Shifts'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'shifts:review')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { shifts: await shiftService!.listClosed(authenticated.user.organizationId) };
  });

  app.post('/api/v1/shifts/:shiftId/review', { schema: { summary: 'Mark a closed shift as reviewed by Finance or Admin', tags: ['Shifts'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'shifts:review')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { shiftId } = request.params as { shiftId: string };
    const result = await shiftService!.review(authenticated.user.organizationId, authenticated.user.id, shiftId, new Date());
    if (!result.ok) return reply.code(result.reason === 'SHIFT_NOT_FOUND' ? 404 : 409).send({ error: result.reason });
    return result.shift;
  });

  app.get('/api/v1/customers', { schema: { summary: 'List active organization customers', tags: ['Customers'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'sales:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { customers: await customerService.list(authenticated.user.organizationId) };
  });


  app.patch('/api/v1/customers/:partyId', async(request,reply)=>{
    const authenticated=await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if(!authenticated.ok)return reply.code(401).send({error:authenticated.reason});
    if(!can(authenticated.user.role,'sales:write')||!can(authenticated.user.role,'inventory:write'))return reply.code(403).send({error:'FORBIDDEN'});
    const {partyId}=request.params as {partyId:string};const parsed=updateCustomerSchema.safeParse(request.body);
    if(!productSchema.shape.id.safeParse(partyId).success||!parsed.success)return reply.code(400).send({error:'INVALID_CUSTOMER'});
    if(!customerService.update)return reply.code(503).send({error:'CUSTOMER_UPDATE_UNAVAILABLE'});
    const result=await customerService.update(authenticated.user.organizationId,authenticated.user.id,partyId,parsed.data);
    if(!result.ok)return reply.code(result.reason==='PARTY_NOT_FOUND' ? 404 : 409).send({error:result.reason});
    return result.party;
  });
  app.patch('/api/v1/suppliers/:partyId', async(request,reply)=>{
    const authenticated=await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if(!authenticated.ok)return reply.code(401).send({error:authenticated.reason});
    if(!can(authenticated.user.role,'purchases:manage'))return reply.code(403).send({error:'FORBIDDEN'});
    const {partyId}=request.params as {partyId:string};const parsed=updateSupplierSchema.safeParse(request.body);
    if(!productSchema.shape.id.safeParse(partyId).success||!parsed.success)return reply.code(400).send({error:'INVALID_SUPPLIER'});
    if(!supplierService?.update)return reply.code(503).send({error:'SUPPLIER_UPDATE_UNAVAILABLE'});
    const result=await supplierService.update(authenticated.user.organizationId,authenticated.user.id,partyId,parsed.data);
    if(!result.ok)return reply.code(result.reason==='PARTY_NOT_FOUND' ? 404 : 409).send({error:result.reason});
    return result.party;
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

  app.get('/api/v1/suppliers', { schema: { summary: 'List active organization suppliers', tags: ['Purchasing'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { suppliers: await supplierService!.list(authenticated.user.organizationId) };
  });

  app.post('/api/v1/suppliers', { schema: { summary: 'Create an organization supplier', tags: ['Purchasing'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = createSupplierSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_SUPPLIER' });
    const result = await supplierService!.create(authenticated.user.organizationId, parsed.data);
    return reply.code(201).send(result.supplier);
  });
  app.get('/api/v1/suppliers/import-template.xlsx', async (request, reply) => { const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie)); if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason }); if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' }); if (!supplierImportService) return reply.code(503).send({ error: 'SUPPLIER_IMPORT_UNAVAILABLE' }); return reply.header('content-disposition', 'attachment; filename="supplier-import-template.xlsx"').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await supplierImportService.template()); });
  app.post('/api/v1/suppliers/import.xlsx/preview', async (request, reply) => { const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie)); if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason }); if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' }); if (!supplierImportService) return reply.code(503).send({ error: 'SUPPLIER_IMPORT_UNAVAILABLE' }); if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'INVALID_IMPORT_FILE' }); return supplierImportService.preview(request.body); });
  app.post('/api/v1/suppliers/import.xlsx', async (request, reply) => { const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie)); if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason }); if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' }); if (!supplierImportService) return reply.code(503).send({ error: 'SUPPLIER_IMPORT_UNAVAILABLE' }); if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'INVALID_IMPORT_FILE' }); const result = await supplierImportService.import(authenticated.user.organizationId, authenticated.user.id, request.body); return result.ok ? reply.code(201).send(result) : reply.code(422).send(result); });

  app.post('/api/v1/purchases', { schema: { summary: 'Post an atomic purchase with barcode lines, stock receipt, and settlement', tags: ['Purchasing'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    const parsed = createPurchaseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_PURCHASE' });
    const result = await purchaseService!.post(authenticated.user.organizationId, authenticated.user.id, idempotencyKey, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(result.replayed ? 200 : 201).send(result.purchase);
  });

  app.get('/api/v1/purchases', { schema: { summary: 'List organization purchase documents for revision or return selection', tags: ['Purchasing'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    if (!purchaseService?.list) return reply.code(503).send({ error: 'PURCHASE_READ_UNAVAILABLE' });
    return { purchases: await purchaseService.list(authenticated.user.organizationId) };
  });

  app.get('/api/v1/purchases/:purchaseId', { schema: { summary: 'Read one organization purchase and its immutable lines', tags: ['Purchasing'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    if (!purchaseService?.find) return reply.code(503).send({ error: 'PURCHASE_READ_UNAVAILABLE' });
    const { purchaseId } = request.params as { purchaseId: string };
    const purchase = await purchaseService.find(authenticated.user.organizationId, purchaseId);
    return purchase ? { purchase } : reply.code(404).send({ error: 'PURCHASE_NOT_FOUND' });
  });

  app.put('/api/v1/purchases/:purchaseId', { schema: { summary: 'Replace a posted purchase through compensating stock and financial entries', tags: ['Purchasing'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { purchaseId } = request.params as { purchaseId?: string };
    const idempotencyKey = request.headers['idempotency-key'];
    if (!purchaseId || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return reply.code(400).send({ error: !purchaseId ? 'INVALID_PURCHASE' : 'IDEMPOTENCY_KEY_REQUIRED' });
    const parsed = createPurchaseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_PURCHASE' });
    const result = await purchaseRevisionService!.revise(authenticated.user.organizationId, authenticated.user.id, purchaseId, idempotencyKey, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(result.replayed ? 200 : 201).send(result.purchase);
  });

  app.post('/api/v1/purchase-returns', { schema: { summary: 'Post an atomic purchase return with split supplier-credit and treasury-refund settlements', tags: ['Purchasing'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'purchases:manage')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    const parsed = createPurchaseReturnSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_PURCHASE_RETURN' });
    const result = await purchaseReturnService!.post(authenticated.user.organizationId, authenticated.user.id, idempotencyKey, parsed.data);
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(result.replayed ? 200 : 201).send(result.purchaseReturn);
  });

  app.get('/api/v1/pos/options', { schema: { summary: 'Read organization sale-entry options without purchase costs', tags: ['Sales'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'sales:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const organizationId = authenticated.user.organizationId;
    const [products, customers, warehouses] = await Promise.all([
      productService.list(organizationId), customerService.list(organizationId), warehouseService.list(organizationId)
    ]);
    return {
      products: products.filter((product) => product.active).map(({ id, name, sku, barcode, salePrice }) => ({ id, name, sku, barcode, salePrice })),
      customers: customers.filter((customer) => customer.active).map(({ id, name }) => ({ id, name })),
      warehouses: warehouses.filter((warehouse) => warehouse.active).map(({ id, name }) => ({ id, name }))
    };
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

  app.get('/api/v1/sales', { schema: { summary: 'List a bounded, organization-scoped sales history', tags: ['Sales'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'reports:read')) return reply.code(403).send({ error: 'FORBIDDEN' });
    if (!salesHistoryService) return reply.code(503).send({ error: 'SALES_HISTORY_UNAVAILABLE' });
    const parsed = salesHistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_SALES_HISTORY_QUERY' });
    return salesHistoryService.list(authenticated.user.organizationId, parsed.data);
  });

  app.get('/api/v1/reports/sales/export.csv', { schema: { summary: 'Export filtered sales history as one row per sale line', tags: ['Reports'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'reports:read')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = salesExportQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_SALES_EXPORT_FILTER' });
    const csv = await salesExportService!.exportCsv(authenticated.user.organizationId, authenticated.user.id, parsed.data);
    return reply.header('content-disposition', 'attachment; filename="sales-history.csv"').type('text/csv; charset=utf-8').send(csv);
  });

  app.get('/api/v1/reports/sales/export.xlsx', { schema: { summary: 'Export filtered sales history as an Excel workbook', tags: ['Reports'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'reports:read')) return reply.code(403).send({ error: 'FORBIDDEN' });
    if (!salesExportService?.exportXlsx) return reply.code(503).send({ error: 'SALES_EXCEL_EXPORT_UNAVAILABLE' });
    const parsed = salesExportQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_SALES_EXPORT_FILTER' });
    const workbook = await salesExportService.exportXlsx(authenticated.user.organizationId, authenticated.user.id, parsed.data);
    return reply.header('content-disposition', 'attachment; filename="sales-history.xlsx"').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(workbook);
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

  app.post('/api/v1/returns/:returnId/revise', { schema: { summary: 'Reverse and replace a posted invoice return', tags: ['Sales'] } }, async (request, reply) => {
    const authenticated = await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if (!authenticated.ok) return reply.code(401).send({ error: authenticated.reason });
    if (!can(authenticated.user.role, 'sales:write')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    const parsed = createInvoiceReturnSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_RETURN' });
    const { returnId } = request.params as { returnId: string };
    const result = await returnRevisionService!.revise(authenticated.user.organizationId, authenticated.user.id, returnId, idempotencyKey, parsed.data);
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



  app.get('/api/v1/inventory/transfers',async(request,reply)=>{
    const auth=await authenticationService.authenticate(readSessionToken(request.headers.cookie));if(!auth.ok)return reply.code(401).send({error:auth.reason});
    if(!can(auth.user.role,'inventory:write'))return reply.code(403).send({error:'FORBIDDEN'});
    const query=inventoryTransferQuerySchema.safeParse(request.query);if(!query.success)return reply.code(400).send({error:'INVALID_TRANSFER_QUERY'});
    if(!inventoryTransferService)return reply.code(503).send({error:'TRANSFERS_UNAVAILABLE'});
    return inventoryTransferService.list(auth.user.organizationId,query.data);
  });
  app.post('/api/v1/inventory/transfers',async(request,reply)=>{
    const auth=await authenticationService.authenticate(readSessionToken(request.headers.cookie));if(!auth.ok)return reply.code(401).send({error:auth.reason});
    if(!can(auth.user.role,'inventory:write'))return reply.code(403).send({error:'FORBIDDEN'});
    const key=request.headers['idempotency-key'];if(typeof key!=='string'||!key.trim()||key.length>200)return reply.code(400).send({error:'IDEMPOTENCY_KEY_REQUIRED'});
    const parsed=createInventoryTransferSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_TRANSFER'});
    if(!inventoryTransferService)return reply.code(503).send({error:'TRANSFERS_UNAVAILABLE'});
    const result=await inventoryTransferService.post(auth.user.organizationId,auth.user.id,key,parsed.data,request.id);
    if(!result.ok)return reply.code(409).send({error:result.reason});
    return reply.code(result.replayed ? 200 : 201).send({transfer:result.transfer,replayed:result.replayed});
  });

  app.get('/api/v1/inventory/counts',async(request,reply)=>{
    const authenticated=await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if(!authenticated.ok)return reply.code(401).send({error:authenticated.reason});
    if(!can(authenticated.user.role,'inventory:write'))return reply.code(403).send({error:'FORBIDDEN'});
    if(!stockCountService)return reply.code(503).send({error:'STOCK_COUNT_UNAVAILABLE'});
    const parsed=stockCountQuerySchema.safeParse(request.query);if(!parsed.success)return reply.code(400).send({error:'INVALID_STOCK_COUNT_QUERY'});
    return stockCountService.list(authenticated.user.organizationId,parsed.data);
  });
  app.post('/api/v1/inventory/counts',async(request,reply)=>{
    const authenticated=await authenticationService.authenticate(readSessionToken(request.headers.cookie));
    if(!authenticated.ok)return reply.code(401).send({error:authenticated.reason});
    if(!can(authenticated.user.role,'inventory:write'))return reply.code(403).send({error:'FORBIDDEN'});
    if(!stockCountService)return reply.code(503).send({error:'STOCK_COUNT_UNAVAILABLE'});
    const key=request.headers['idempotency-key'];if(typeof key!=='string'||!key.trim()||key.length>200)return reply.code(400).send({error:'IDEMPOTENCY_KEY_REQUIRED'});
    const parsed=createStockCountSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_STOCK_COUNT'});
    const result=await stockCountService.post(authenticated.user.organizationId,authenticated.user.id,key,parsed.data);
    if(!result.ok)return reply.code(409).send({error:result.reason});
    return reply.code(result.replayed ? 200 : 201).send({count:result.count,replayed:result.replayed});
  });
  app.get('/api/v1/inventory/thresholds',async(request,reply)=>{
    const authenticated=await authenticationService.authenticate(readSessionToken(request.headers.cookie));if(!authenticated.ok)return reply.code(401).send({error:authenticated.reason});
    if(!can(authenticated.user.role,'inventory:write')&&!can(authenticated.user.role,'reports:read'))return reply.code(403).send({error:'FORBIDDEN'});
    if(!stockThresholdService)return reply.code(503).send({error:'STOCK_THRESHOLD_UNAVAILABLE'});
    const parsed=stockThresholdQuerySchema.safeParse(request.query);if(!parsed.success)return reply.code(400).send({error:'INVALID_STOCK_THRESHOLD_QUERY'});
    return stockThresholdService.list(authenticated.user.organizationId,parsed.data);
  });
  app.put('/api/v1/inventory/thresholds',async(request,reply)=>{
    const authenticated=await authenticationService.authenticate(readSessionToken(request.headers.cookie));if(!authenticated.ok)return reply.code(401).send({error:authenticated.reason});
    if(!can(authenticated.user.role,'inventory:write'))return reply.code(403).send({error:'FORBIDDEN'});
    if(!stockThresholdService)return reply.code(503).send({error:'STOCK_THRESHOLD_UNAVAILABLE'});
    const parsed=setStockThresholdSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_STOCK_THRESHOLD'});
    const result=await stockThresholdService.set(authenticated.user.organizationId,authenticated.user.id,parsed.data);if(!result.ok)return reply.code(409).send({error:result.reason});return result.threshold;
  });
  return app;
}
