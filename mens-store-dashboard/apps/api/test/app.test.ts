import type { createInventoryTransferService } from '../src/modules/inventory/transfer.js';
import type { createStockCountService } from '../src/modules/inventory/count.js';
import type { createStockThresholdService } from '../src/modules/inventory/threshold.js';
import { describe, expect, it, vi } from 'vitest';
import { buildApp, type ProductService, type CustomerService, type SupplierService } from '../src/app.js';

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
  it('composes customer-import authentication and the workbook parser through the application',async()=>{
    const auth={...authenticationService,authenticate:async()=>({ok:true as const,token:'token',user:registeredUser})};
    const imports={template:async()=>Buffer.from('template'),preview:async()=>({valid:true,rows:[],errors:[]}),import:async()=>({ok:true as const,imported:1,replayed:false})};
    const app=await buildApp(successIdentity,auth,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,{...customerService,imports},salesService);
    try{const response=await app.inject({method:'POST',url:'/api/v1/customers/import-preview',headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},payload:Buffer.from('workbook')});expect(response.statusCode).toBe(200);}finally{await app.close();}
  });
  it('authorizes paginated party directories and reasoned lifecycle changes with session-owned scope',async()=>{
    const directory=vi.fn(async()=>({kind:'customers',parties:[],total:0,limit:25,offset:0})),lifecycle=vi.fn(async()=>({ok:true as const,party:{id:registeredUser.id,active:false,version:2}}));
    const make=(role:'ADMIN'|'MANAGER'|'WAREHOUSE'|'CASHIER'|'FINANCE'|null,mode:'live'|'absent'='live')=>{
      const auth=role?{...authenticationService,authenticate:async()=>({ok:true as const,token:'token',user:{...registeredUser,role}})}:authenticationService;
      return buildApp(successIdentity,auth,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,mode==='live'?{...customerService,directory:directory as any,lifecycle:lifecycle as any}:customerService,salesService,undefined,undefined,undefined,undefined,undefined,undefined,undefined,mode==='live'?{list:async()=>[],create:async()=>({ok:true as const,supplier:{} as any}),directory:directory as any,lifecycle:lifecycle as any}:undefined);
    };
    const payload={version:1,active:false,reason:'توقف التعامل'};
    for(const role of [null,'ADMIN','MANAGER','WAREHOUSE','CASHIER','FINANCE'] as const){const app=await make(role);try{for(const kind of ['customers','suppliers']){
      const allowed=role==='ADMIN'||role==='MANAGER'||(role==='WAREHOUSE'&&kind==='suppliers'),expected=role===null?401:allowed?200:403;
      expect((await app.inject({method:'GET',url:`/api/v1/${kind}/directory?status=archived`})).statusCode).toBe(expected);
      expect((await app.inject({method:'PATCH',url:`/api/v1/${kind}/${registeredUser.id}/lifecycle`,payload})).statusCode).toBe(expected);
      if(allowed){expect(directory).toHaveBeenLastCalledWith(input.organizationId,{status:'archived',limit:25,offset:0});expect(lifecycle).toHaveBeenLastCalledWith(input.organizationId,registeredUser.id,registeredUser.id,payload);}
    }}finally{await app.close();}}
    const app=await make('ADMIN');try{
      expect((await app.inject({method:'GET',url:'/api/v1/customers/directory?limit=101'})).statusCode).toBe(400);
      for(const [id,body] of [['invalid',payload],[registeredUser.id,{...payload,reason:''}]] as const)expect((await app.inject({method:'PATCH',url:`/api/v1/customers/${id}/lifecycle`,payload:body})).statusCode).toBe(400);
      lifecycle.mockResolvedValueOnce({ok:false,reason:'PARTY_NOT_FOUND'} as any);expect((await app.inject({method:'PATCH',url:`/api/v1/customers/${registeredUser.id}/lifecycle`,payload})).statusCode).toBe(404);
      lifecycle.mockResolvedValueOnce({ok:false,reason:'OPEN_BALANCE'} as any);expect((await app.inject({method:'PATCH',url:`/api/v1/suppliers/${registeredUser.id}/lifecycle`,payload})).statusCode).toBe(409);
    }finally{await app.close();}
    const absent=await make('ADMIN','absent');try{for(const kind of ['customers','suppliers']){expect((await absent.inject({method:'GET',url:`/api/v1/${kind}/directory`})).statusCode).toBe(503);expect((await absent.inject({method:'PATCH',url:`/api/v1/${kind}/${registeredUser.id}/lifecycle`,payload})).statusCode).toBe(503);}}finally{await absent.close();}
  },30000);
  it('authorizes and validates expense-history reads without exposing another organization or missing wiring',async()=>{
    const list=vi.fn(async()=>({expenses:[],total:0,totalAmount:'0.0000',limit:25,offset:0}));
    const url='/api/v1/expenses?from=2026-10-01&to=2026-10-30';
    const make=(role:'ADMIN'|'FINANCE'|'CASHIER'|null,mode:'live'|'no-method'|'absent'='live')=>buildApp(successIdentity,role?{...authenticationService,authenticate:async()=>({ok:true as const,token:'token',user:{...registeredUser,role}})}:authenticationService,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,customerService,salesService,undefined,undefined,undefined,undefined,undefined,undefined,mode==='absent'?undefined:{post:async()=>({ok:false as const,reason:'ACTOR_UNAVAILABLE'}),...(mode==='live'?{list}:{})});
    for(const role of [null,'ADMIN','FINANCE','CASHIER'] as const){const app=await make(role);try{expect((await app.inject({method:'GET',url})).statusCode).toBe(role===null?401:role==='CASHIER'?403:200);}finally{await app.close();}}
    expect(list).toHaveBeenLastCalledWith(input.organizationId,{from:new Date('2026-10-01'),to:new Date('2026-10-30'),limit:25,offset:0});
    const app=await make('ADMIN');try{expect((await app.inject({method:'GET',url:url+'&organizationId=foreign'})).statusCode).toBe(400);list.mockRejectedValueOnce(Error('private SQL'));expect((await app.inject({method:'GET',url})).statusCode).toBe(500);}finally{await app.close();}
    for(const mode of ['absent','no-method'] as const){const app=await make('ADMIN',mode);try{expect((await app.inject({method:'GET',url})).statusCode).toBe(503);}finally{await app.close();}}
  },30000);
  it('scopes account statement reads, validates dates and reports missing services and parties',async()=>{
    const read=vi.fn(async()=>({party:{id:registeredUser.id}}));
    const url=(kind:string)=>`/api/v1/${kind}/${registeredUser.id}/statement?from=2026-10-01&to=2026-10-30`;
    const make=async(role:'ADMIN'|'FINANCE'|'WAREHOUSE'|'CASHIER'|null,available=true)=>{
      const auth=role ? {...authenticationService,authenticate:async()=>({ok:true as const,token:'session',user:{...registeredUser,role}})} : authenticationService;
      const customers=available ? {...customerService,statement:read as any} : customerService;
      const suppliers=available ? {list:async()=>[],create:async()=>({ok:true as const,supplier:{} as any}),statement:read as any} : undefined;
      return buildApp(successIdentity,auth,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,customers,salesService,undefined,undefined,undefined,undefined,undefined,undefined,undefined,suppliers);
    };
    for(const role of [null,'ADMIN','FINANCE','WAREHOUSE','CASHIER'] as const){
      const app=await make(role);
      try{for(const kind of ['customers','suppliers']){
        const allowed=role==='ADMIN'||role==='FINANCE'||(kind==='customers'?role==='CASHIER':role==='WAREHOUSE');
        const response=await app.inject({method:'GET',url:url(kind)});
        expect(response.statusCode).toBe(role===null?401:allowed?200:403);
        if(allowed)expect(read).toHaveBeenLastCalledWith(input.organizationId,registeredUser.id,{from:new Date('2026-10-01'),to:new Date('2026-10-30'),limit:25,offset:0});
      }}finally{await app.close();}
    }
    const app=await make('ADMIN');
    try{
      for(const bad of [url('customers').replace(registeredUser.id,'invalid'),url('suppliers')+'&organizationId=foreign',url('customers').replace('2026-10-01','2027-01-01')])expect((await app.inject({method:'GET',url:bad})).statusCode).toBe(400);
      read.mockResolvedValueOnce(null as any);expect((await app.inject({method:'GET',url:url('customers')})).statusCode).toBe(404);
      read.mockRejectedValueOnce(Error('private SQL'));expect((await app.inject({method:'GET',url:url('suppliers')})).statusCode).toBe(500);
    }finally{await app.close();}
    const missing=await make('ADMIN',false);
    try{for(const kind of ['customers','suppliers'])expect((await missing.inject({method:'GET',url:url(kind)})).statusCode).toBe(503);}finally{await missing.close();}
  });
  it('authorizes and validates product PATCH using only session ownership and actor', async () => {
    const id = registeredUser.id;
    const payload = { name: 'Shirt', sku: 'sh-1', barcode: null, categoryId: null, salePrice: '20.1234', costPrice: '10', version: 1 };
    let role: 'ADMIN' | 'MANAGER' | 'WAREHOUSE' | 'CASHIER' | 'FINANCE' = 'ADMIN';
    let signedIn = false;
    const auth = { ...authenticationService, authenticate: async () => signedIn ? ({ ok: true as const, token: 'token', user: { ...registeredUser, role } }) : ({ ok: false as const, reason: 'UNAUTHENTICATED' as const }) };
    const product = { id, organizationId: input.organizationId, ...payload, sku: 'SH-1', active: true, version: 2 };
    const update = vi.fn<NonNullable<ProductService['update']>>().mockResolvedValue({ ok: true, product });
    const app = await buildApp(successIdentity, auth, userDirectoryService, categoryService, { ...productService, update }, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const call = (body: object = payload, productId = id) => app.inject({ method: 'PATCH', url: `/api/v1/products/${productId}`, payload: body });
    try {
      expect((await call()).statusCode).toBe(401); signedIn = true;
      for (const forbidden of ['CASHIER', 'FINANCE'] as const) { role = forbidden; expect((await call()).statusCode).toBe(403); }
      expect(update).not.toHaveBeenCalled(); role = 'ADMIN';
      for (const body of [{}, { ...payload, organizationId: id }, { ...payload, quantity: '4' }, { ...payload, active: false }, { ...payload, version: 0 }, { ...payload, salePrice: '-1' }]) expect((await call(body)).statusCode).toBe(400);
      expect((await call(payload, 'invalid')).statusCode).toBe(400);
      expect(update).not.toHaveBeenCalled();
      for (const allowed of ['ADMIN', 'MANAGER', 'WAREHOUSE'] as const) { role = allowed; const response = await call(); expect(response.statusCode).toBe(200); expect(response.json()).toEqual(product); }
      expect(update).toHaveBeenCalledWith(input.organizationId, id, id, { ...payload, sku: 'SH-1' });
      update.mockResolvedValueOnce({ ok: false, reason: 'PRODUCT_NOT_FOUND' }); expect((await call()).statusCode).toBe(404);
      update.mockResolvedValueOnce({ ok: false, reason: 'VERSION_CONFLICT' }); const conflict = await call(); expect(conflict.statusCode).toBe(409); expect(conflict.json()).toEqual({ error: 'VERSION_CONFLICT' });
      update.mockRejectedValueOnce(Error('database unavailable')); expect((await call()).statusCode).toBe(500);
    } finally { await app.close(); }
    const unavailable = await buildApp(successIdentity, auth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    try { expect((await unavailable.inject({ method: 'PATCH', url: `/api/v1/products/${id}`, payload })).statusCode).toBe(503); }
    finally { await unavailable.close(); }
  }, 30000);
  it('limits POS options to authenticated sellers, active tenant records, and sale-only fields', async () => {
    const otherId = '4b411dac-9da0-4744-ae12-49c40e24d6b7';
    const products = [input.organizationId, otherId].flatMap((organizationId) => [true, false].map((active) => ({
      id: `${organizationId}-product-${active}`, organizationId, name: 'Tenant shirt', sku: 'SH-1', barcode: '123',
      categoryId: null, salePrice: '19.9500', costPrice: '10.0000', active, version: 1
    })));
    const customers = [input.organizationId, otherId].flatMap((organizationId) => [true, false].map((active) => ({
      id: `${organizationId}-customer-${active}`, organizationId, legacyId: null, name: 'Tenant customer',
      phone: 'private phone', email: 'private@example.test', address: 'private address', notes: 'private notes', creditLimit: '1000.0000', active, version: 1
    })));
    const warehouses = [input.organizationId, otherId].flatMap((organizationId) => [true, false].map((active) => ({ id: `${organizationId}-warehouse-${active}`, organizationId, name: 'Tenant branch', active })));
    const productList = vi.fn(async (organizationId: string) => products.filter((item) => item.organizationId === organizationId));
    const customerList = vi.fn(async (organizationId: string) => customers.filter((item) => item.organizationId === organizationId));
    const warehouseList = vi.fn(async (organizationId: string) => warehouses.filter((item) => item.organizationId === organizationId));
    const services = [{ ...productService, list: productList }, { ...customerService, list: customerList }, { ...warehouseService, list: warehouseList }] as const;
    const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, services[0], services[2], stockService, inventoryMovementService, services[1], salesService);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/pos/options' })).statusCode).toBe(401);
    await anonymous.close();
    for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'WAREHOUSE', 'FINANCE'] as const) {
      const auth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role } }) };
      const app = await buildApp(successIdentity, auth, userDirectoryService, categoryService, services[0], services[2], stockService, inventoryMovementService, services[1], salesService);
      const response = await app.inject({ method: 'GET', url: `/api/v1/pos/options?organizationId=${otherId}` });
      if (role === 'FINANCE' || role === 'WAREHOUSE') expect(response.statusCode).toBe(403);
      else {
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          products: [{ id: `${input.organizationId}-product-true`, name: 'Tenant shirt', sku: 'SH-1', barcode: '123', salePrice: '19.9500' }],
          customers: [{ id: `${input.organizationId}-customer-true`, name: 'Tenant customer' }],
          warehouses: [{ id: `${input.organizationId}-warehouse-true`, name: 'Tenant branch' }]
        });
        expect(productList).toHaveBeenLastCalledWith(input.organizationId);
        expect(customerList).toHaveBeenLastCalledWith(input.organizationId);
        expect(warehouseList).toHaveBeenLastCalledWith(input.organizationId);
      }
      if (role === 'CASHIER') {
        for (const url of ['/api/v1/products', '/api/v1/warehouses', '/api/v1/inventory/stock', '/api/v1/purchases', '/api/v1/users']) expect((await app.inject({ method: 'GET', url })).statusCode).toBe(403);
        for (const url of ['/api/v1/products', '/api/v1/warehouses', '/api/v1/inventory/movements']) expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(403);
      }
      await app.close();
    }
    expect(productList).toHaveBeenCalledTimes(3);
    expect(customerList).toHaveBeenCalledTimes(3);
    expect(warehouseList).toHaveBeenCalledTimes(3);
  }, 30000);

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
    expect((await admin.inject({ method: 'GET', url: `/api/v1/inventory/stock?productId=${productId}&branchId=${warehouseId}&asOf=2026-01-01T00:00:00.000Z`, headers: { cookie: 'session=token' } })).json()).toEqual({ quantity: '7.2500' });
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
    const expenses = { post: async (_organizationId: string, _actorUserId: string, key: string) => key==='actor-conflict' ? ({ok:false as const,reason:'ACTOR_UNAVAILABLE'}) : ({ ok: true as const, expense, replayed: key === 'replay' }) };
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
    expect((await finance.inject({method:'POST',url:'/api/v1/expenses',headers:{'idempotency-key':'actor-conflict'},payload:body})).statusCode).toBe(409);
    const unavailable=await buildApp(successIdentity,financeAuth,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,customerService,salesService);expect((await unavailable.inject({method:'POST',url:'/api/v1/expenses',payload:body})).statusCode).toBe(503);
    await Promise.all([finance.close(), cashier.close(), anonymous.close(),unavailable.close()]);
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

  it('posts validated idempotent purchases only for purchasing roles', async () => {
    const supplierId = '9f112860-9eb3-402f-b722-740616412a85'; const warehouseId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a'; const productId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
    const body = { supplierId, warehouseId, lines: [{ barcode: 'BC-1', quantity: '2.0000', unitCost: '10.0000' }], payments: [{ method: 'CASH' as const, amount: '20.0000' }], occurredAt: '2026-01-01T00:00:00.000Z' };
    const purchases = { post: async (_organizationId: string, _actorUserId: string, key: string) => key === 'bad' ? ({ ok: false as const, reason: 'PRODUCT_UNAVAILABLE' }) : ({ ok: true as const, purchase: { id: productId }, replayed: key === 'replay' }) };
    const warehouseAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'WAREHOUSE' as const } }) }; const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const args = [successIdentity, warehouseAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, purchases] as const;
    const warehouse = await buildApp(...args); const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, purchases); const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, purchases);
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/purchases', payload: body })).statusCode).toBe(401); expect((await cashier.inject({ method: 'POST', url: '/api/v1/purchases', headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: body })).statusCode).toBe(403); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchases', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(400); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchases', headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: {} })).statusCode).toBe(400); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchases', headers: { cookie: 'session=token', 'idempotency-key': 'bad' }, payload: body })).statusCode).toBe(409); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchases', headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: body })).statusCode).toBe(201); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchases', headers: { cookie: 'session=token', 'idempotency-key': 'replay' }, payload: body })).statusCode).toBe(200);
    await Promise.all([warehouse.close(), cashier.close(), anonymous.close()]);
  });

  it('posts split-settlement purchase returns only for purchasing roles', async () => {
    const supplierId = '9f112860-9eb3-402f-b722-740616412a85'; const warehouseId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a'; const purchaseId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a'; const lineId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
    const body = { purchaseId, lines: [{ purchaseLineId: lineId, quantity: '1.0000' }], reason: 'Damaged item', settlements: [{ kind: 'SUPPLIER_CREDIT' as const, amount: '4.0000' }, { kind: 'TREASURY_REFUND' as const, paymentMethod: 'CASH' as const, amount: '6.0000' }], occurredAt: '2026-01-01T00:00:00.000Z' };
    const returns = { post: async (_organizationId: string, _actorUserId: string, key: string) => key === 'bad' ? ({ ok: false as const, reason: 'SETTLEMENT_TOTAL_MISMATCH' }) : ({ ok: true as const, purchaseReturn: { id: supplierId, purchaseId, total: '10.0000' }, replayed: key === 'replay' }) };
    const warehouseAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'WAREHOUSE' as const } }) }; const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const args = [successIdentity, warehouseAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, returns] as const;
    const warehouse = await buildApp(...args); const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, returns); const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, returns);
    expect((await anonymous.inject({ method: 'POST', url: '/api/v1/purchase-returns', payload: body })).statusCode).toBe(401); expect((await cashier.inject({ method: 'POST', url: '/api/v1/purchase-returns', headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: body })).statusCode).toBe(403); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchase-returns', headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(400); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchase-returns', headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: {} })).statusCode).toBe(400); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchase-returns', headers: { cookie: 'session=token', 'idempotency-key': 'bad' }, payload: body })).statusCode).toBe(409); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchase-returns', headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: body })).statusCode).toBe(201); expect((await warehouse.inject({ method: 'POST', url: '/api/v1/purchase-returns', headers: { cookie: 'session=token', 'idempotency-key': 'replay' }, payload: body })).statusCode).toBe(200);
    await Promise.all([warehouse.close(), cashier.close(), anonymous.close()]);
  });

  it('replaces posted purchases only for purchasing roles', async () => {
    const supplierId = '9f112860-9eb3-402f-b722-740616412a85'; const warehouseId = 'f710274a-4b51-49bd-a31f-d6a8ab81b01a'; const purchaseId = 'a0ac2c74-c66c-4a28-b658-34c88db36e8a';
    const body = { supplierId, warehouseId, lines: [{ barcode: 'BC-1', quantity: '2.0000', unitCost: '10.0000' }], payments: [{ method: 'CASH' as const, amount: '20.0000' }], occurredAt: '2026-01-01T00:00:00.000Z' };
    const revisions = { revise: async (_organizationId: string, _actorUserId: string, _purchaseId: string, key: string) => key === 'bad' ? ({ ok: false as const, reason: 'INSUFFICIENT_STOCK' }) : ({ ok: true as const, purchase: { id: supplierId }, replayed: key === 'replay' }) };
    const warehouseAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'WAREHOUSE' as const } }) }; const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const args = [successIdentity, warehouseAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, revisions] as const;
    const warehouse = await buildApp(...args); const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, revisions); const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, revisions);
    const url = `/api/v1/purchases/${purchaseId}`;
    expect((await anonymous.inject({ method: 'PUT', url, payload: body })).statusCode).toBe(401); expect((await cashier.inject({ method: 'PUT', url, headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: body })).statusCode).toBe(403); expect((await warehouse.inject({ method: 'PUT', url: '/api/v1/purchases/', headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: body })).statusCode).toBe(400); expect((await warehouse.inject({ method: 'PUT', url, headers: { cookie: 'session=token' }, payload: body })).statusCode).toBe(400); expect((await warehouse.inject({ method: 'PUT', url, headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: {} })).statusCode).toBe(400); expect((await warehouse.inject({ method: 'PUT', url, headers: { cookie: 'session=token', 'idempotency-key': 'bad' }, payload: body })).statusCode).toBe(409); expect((await warehouse.inject({ method: 'PUT', url, headers: { cookie: 'session=token', 'idempotency-key': 'key' }, payload: body })).statusCode).toBe(201); expect((await warehouse.inject({ method: 'PUT', url, headers: { cookie: 'session=token', 'idempotency-key': 'replay' }, payload: body })).statusCode).toBe(200);
    await Promise.all([warehouse.close(), cashier.close(), anonymous.close()]);
  });

  it('exports filtered sales history only for reporting roles', async () => {
    const exports = { exportCsv: async () => '\uFEFFinvoice_id\r\n"sale-1"\r\n' };
    const financeAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'FINANCE' as const } }) }; const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const args = [successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, exports] as const;
    const finance = await buildApp(...args); const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, exports); const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, exports);
    const url = '/api/v1/reports/sales/export.csv?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z';
    expect((await anonymous.inject({ method: 'GET', url })).statusCode).toBe(401); expect((await cashier.inject({ method: 'GET', url, headers: { cookie: 'session=token' } })).statusCode).toBe(403); expect((await finance.inject({ method: 'GET', url: '/api/v1/reports/sales/export.csv?from=2026-01-03T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z', headers: { cookie: 'session=token' } })).statusCode).toBe(400); const response = await finance.inject({ method: 'GET', url, headers: { cookie: 'session=token' } }); expect(response.statusCode).toBe(200); expect(response.headers['content-type']).toContain('text/csv'); expect(response.headers['content-disposition']).toContain('sales-history.csv'); expect(response.body).toContain('sale-1');
    await Promise.all([finance.close(), cashier.close(), anonymous.close()]);
  });

  it('exports filtered sales history as a downloadable Excel workbook for reporting roles', async () => {
    const exports = { exportCsv: async () => '', exportXlsx: async () => Buffer.from('xlsx') };
    const financeAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'FINANCE' as const } }) }; const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const args = [successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, exports] as const;
    const finance = await buildApp(...args); const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, exports); const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, exports); const unavailable = await buildApp(successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { exportCsv: async () => '' });
    const url = '/api/v1/reports/sales/export.xlsx?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z';
    expect((await anonymous.inject({ method: 'GET', url })).statusCode).toBe(401); expect((await cashier.inject({ method: 'GET', url, headers: { cookie: 'session=token' } })).statusCode).toBe(403); expect((await unavailable.inject({ method: 'GET', url, headers: { cookie: 'session=token' } })).statusCode).toBe(503); expect((await finance.inject({ method: 'GET', url: '/api/v1/reports/sales/export.xlsx?from=2026-01-03T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z', headers: { cookie: 'session=token' } })).statusCode).toBe(400);
    const response = await finance.inject({ method: 'GET', url, headers: { cookie: 'session=token' } }); expect(response.statusCode).toBe(200); expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); expect(response.headers['content-disposition']).toContain('sales-history.xlsx'); expect(response.rawPayload).toEqual(Buffer.from('xlsx'));
    await Promise.all([finance.close(), cashier.close(), anonymous.close(), unavailable.close()]);
  });

  it('lists a bounded sales history only for reporting roles and validates filters', async () => {
    const history = { list: async (_organizationId: string, query: { limit: number; offset: number }) => ({ sales: [{ id: 'sale-1', customerName: 'Ahmed', warehouseName: 'Main', total: '10.0000', status: 'POSTED' as const, occurredAt: new Date('2026-01-01T00:00:00.000Z') }], total: 1, limit: query.limit, offset: query.offset }) };
    const financeAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'FINANCE' as const } }) }; const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const args = [successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, history] as const;
    const finance = await buildApp(...args); const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, history); const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, history); const unavailable = await buildApp(successIdentity, financeAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const url = '/api/v1/sales?limit=2&offset=1&warehouseId=f710274a-4b51-49bd-a31f-d6a8ab81b01a';
    expect((await anonymous.inject({ method: 'GET', url })).statusCode).toBe(401); expect((await cashier.inject({ method: 'GET', url, headers: { cookie: 'session=token' } })).statusCode).toBe(403); expect((await unavailable.inject({ method: 'GET', url, headers: { cookie: 'session=token' } })).statusCode).toBe(503); expect((await finance.inject({ method: 'GET', url: '/api/v1/sales?limit=101', headers: { cookie: 'session=token' } })).statusCode).toBe(400);
    const response = await finance.inject({ method: 'GET', url, headers: { cookie: 'session=token' } }); expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ total: 1, limit: 2, offset: 1, sales: [{ id: 'sale-1', warehouseName: 'Main' }] });
    await Promise.all([finance.close(), cashier.close(), anonymous.close(), unavailable.close()]);
  });

  it('provides an authorized, preview-first atomic category Excel import workflow', async () => {
    const imports = { template: async () => Buffer.from('template'), preview: async () => ({ valid: true, rows: [{ row: 2, name: 'Shirts' }], errors: [] }), import: async (_organizationId: string, _actorUserId: string, file: Buffer) => file.toString() === 'invalid' ? ({ ok: false as const, preview: { valid: false, rows: [], errors: [{ row: 2, message: 'INVALID_NAME' }] } }) : ({ ok: true as const, imported: 1 }) };
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) }; const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const args = [successIdentity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, imports] as const;
    const admin = await buildApp(...args); const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, imports); const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, imports); const unavailable = await buildApp(successIdentity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    const template = '/api/v1/categories/import-template.xlsx'; const preview = '/api/v1/categories/import.xlsx/preview'; const apply = '/api/v1/categories/import.xlsx'; const headers = { cookie: 'session=token', 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    expect((await anonymous.inject({ method: 'GET', url: template })).statusCode).toBe(401); expect((await cashier.inject({ method: 'GET', url: template, headers: { cookie: 'session=token' } })).statusCode).toBe(403); expect((await unavailable.inject({ method: 'GET', url: template, headers: { cookie: 'session=token' } })).statusCode).toBe(503); const templateResponse = await admin.inject({ method: 'GET', url: template, headers: { cookie: 'session=token' } }); expect(templateResponse.statusCode).toBe(200); expect(templateResponse.headers['content-disposition']).toContain('category-import-template.xlsx');
    expect((await anonymous.inject({ method: 'POST', url: preview, headers, payload: Buffer.from('valid') })).statusCode).toBe(401); expect((await cashier.inject({ method: 'POST', url: preview, headers, payload: Buffer.from('valid') })).statusCode).toBe(403); expect((await unavailable.inject({ method: 'POST', url: preview, headers, payload: Buffer.from('valid') })).statusCode).toBe(503); expect((await admin.inject({ method: 'POST', url: preview, headers: { cookie: 'session=token', 'content-type': 'application/json' }, payload: {} })).statusCode).toBe(400); expect((await admin.inject({ method: 'POST', url: preview, headers, payload: Buffer.from('valid') })).json()).toMatchObject({ valid: true }); expect((await anonymous.inject({ method: 'POST', url: apply, headers, payload: Buffer.from('valid') })).statusCode).toBe(401); expect((await cashier.inject({ method: 'POST', url: apply, headers, payload: Buffer.from('valid') })).statusCode).toBe(403); expect((await unavailable.inject({ method: 'POST', url: apply, headers, payload: Buffer.from('valid') })).statusCode).toBe(503); expect((await admin.inject({ method: 'POST', url: apply, headers: { cookie: 'session=token', 'content-type': 'application/json' }, payload: {} })).statusCode).toBe(400); expect((await admin.inject({ method: 'POST', url: apply, headers, payload: Buffer.from('invalid') })).statusCode).toBe(422); expect((await admin.inject({ method: 'POST', url: apply, headers, payload: Buffer.from('valid') })).statusCode).toBe(201);
    await Promise.all([admin.close(), cashier.close(), anonymous.close(), unavailable.close()]);
  });

  it('provides an authorized, preview-first atomic product Excel import workflow', async () => {
    const imports = { template: async () => Buffer.from('template'), preview: async () => ({ valid: true, rows: [{ row: 2 }], errors: [] }), import: async (_organizationId: string, _actorUserId: string, file: Buffer) => file.toString() === 'invalid' ? ({ ok: false as const, preview: { valid: false, rows: [], errors: [{ row: 2, message: 'INVALID_PRODUCT' }] } }) : ({ ok: true as const, imported: 1 }) };
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) }; const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) }; const args = [successIdentity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, imports] as const;
    const admin = await buildApp(...args); const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, imports); const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, imports); const unavailable = await buildApp(successIdentity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService); const headers = { cookie: 'session=token', 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    for (const url of ['/api/v1/products/import-template.xlsx', '/api/v1/products/import.xlsx/preview', '/api/v1/products/import.xlsx']) { const method = url.includes('template') ? 'GET' as const : 'POST' as const; expect((await anonymous.inject({ method, url, headers, payload: Buffer.from('valid') })).statusCode).toBe(401); expect((await cashier.inject({ method, url, headers, payload: Buffer.from('valid') })).statusCode).toBe(403); expect((await unavailable.inject({ method, url, headers, payload: Buffer.from('valid') })).statusCode).toBe(503); }
    expect((await admin.inject({ method: 'GET', url: '/api/v1/products/import-template.xlsx', headers })).headers['content-disposition']).toContain('product-import-template.xlsx'); expect((await admin.inject({ method: 'POST', url: '/api/v1/products/import.xlsx/preview', headers: { cookie: 'session=token', 'content-type': 'application/json' }, payload: {} })).statusCode).toBe(400); expect((await admin.inject({ method: 'POST', url: '/api/v1/products/import.xlsx/preview', headers, payload: Buffer.from('valid') })).json()).toMatchObject({ valid: true }); expect((await admin.inject({ method: 'POST', url: '/api/v1/products/import.xlsx', headers: { cookie: 'session=token', 'content-type': 'application/json' }, payload: {} })).statusCode).toBe(400); expect((await admin.inject({ method: 'POST', url: '/api/v1/products/import.xlsx', headers, payload: Buffer.from('invalid') })).statusCode).toBe(422); expect((await admin.inject({ method: 'POST', url: '/api/v1/products/import.xlsx', headers, payload: Buffer.from('valid') })).statusCode).toBe(201); await Promise.all([admin.close(), cashier.close(), anonymous.close(), unavailable.close()]);
  });

  it('lists and reads only organization-scoped purchase snapshots for purchasing roles', async () => {
    const purchase = { id: 'purchase-1', supplierId: 'supplier-1', warehouseId: 'warehouse-1', status: 'POSTED' as const, total: '10.0000', occurredAt: new Date('2026-10-09T00:00:00.000Z'), lines: [{ id: 'line-1', lineNumber: 1, productId: 'product-1', productName: 'Shirt', sku: 'SH-1', barcode: '123', quantity: '1.0000', unitCost: '10.0000', total: '10.0000' }] }; const purchases = { post: async () => ({ ok: true as const, purchase: { id: 'unused' }, replayed: false }), list: async () => [(({ lines: _lines, ...summary }) => summary)(purchase)], find: async (_organizationId: string, purchaseId: string) => purchaseId === purchase.id ? purchase : null };
    const adminAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: registeredUser }) }; const cashierAuth = { ...authenticationService, authenticate: async () => ({ ok: true as const, token: 'token', user: { ...registeredUser, role: 'CASHIER' as const } }) };
    const args = [successIdentity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, purchases] as const;
    const admin = await buildApp(...args); const cashier = await buildApp(successIdentity, cashierAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, purchases); const anonymous = await buildApp(successIdentity, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, purchases); const unavailable = await buildApp(successIdentity, adminAuth, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/purchases' })).statusCode).toBe(401); expect((await cashier.inject({ method: 'GET', url: '/api/v1/purchases', headers: { cookie: 'session=token' } })).statusCode).toBe(403); expect((await unavailable.inject({ method: 'GET', url: '/api/v1/purchases', headers: { cookie: 'session=token' } })).statusCode).toBe(503); expect((await admin.inject({ method: 'GET', url: '/api/v1/purchases', headers: { cookie: 'session=token' } })).json()).toMatchObject({ purchases: [{ id: purchase.id, total: '10.0000' }] });
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/purchases/purchase-1' })).statusCode).toBe(401); expect((await cashier.inject({ method: 'GET', url: '/api/v1/purchases/purchase-1', headers: { cookie: 'session=token' } })).statusCode).toBe(403); expect((await unavailable.inject({ method: 'GET', url: '/api/v1/purchases/purchase-1', headers: { cookie: 'session=token' } })).statusCode).toBe(503); expect((await admin.inject({ method: 'GET', url: '/api/v1/purchases/missing', headers: { cookie: 'session=token' } })).statusCode).toBe(404); expect((await admin.inject({ method: 'GET', url: '/api/v1/purchases/purchase-1', headers: { cookie: 'session=token' } })).json()).toMatchObject({ purchase: { id: purchase.id, lines: [{ id: 'line-1', productName: 'Shirt' }] } });
    await Promise.all([admin.close(), cashier.close(), anonymous.close(), unavailable.close()]);
  });
});


it('authorizes versioned customer/supplier updates without granting cashier credit-limit edits',async()=>{
  let role: 'ADMIN'|'MANAGER'|'WAREHOUSE'|'CASHIER'|'FINANCE'='ADMIN';let signedIn=false;
  const auth={...authenticationService,authenticate:async()=>signedIn ? ({ok:true as const,token:'token',user:{...registeredUser,role}}) : ({ok:false as const,reason:'UNAUTHENTICATED' as const})};
  const fields={name:'Updated party',phone:null,email:null,address:null,notes:null,version:1};
  const customer={...fields,id:registeredUser.id,organizationId:input.organizationId,legacyId:null,creditLimit:'20.0000',active:true,version:2};
  const supplier={...fields,id:registeredUser.id,organizationId:input.organizationId,active:true,version:2};
  const updateCustomer=vi.fn<NonNullable<CustomerService['update']>>().mockResolvedValue({ok:true,party:customer});
  const updateSupplier=vi.fn<NonNullable<SupplierService['update']>>().mockResolvedValue({ok:true,party:supplier});
  const customers={...customerService,update:updateCustomer};
  const suppliers:SupplierService={list:async()=>[],create:async()=>({ok:true,supplier}),update:updateSupplier};
  const build=(customerApi:CustomerService,supplierApi?:SupplierService)=>buildApp(successIdentity,auth,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,customerApi,salesService,undefined,undefined,undefined,undefined,undefined,undefined,undefined,supplierApi);
  const app=await build(customers,suppliers);
  try{
    for(const kind of ['customers','suppliers']){
      const payload=kind==='customers' ? {...fields,creditLimit:'20.0000'} : fields;
      const call=(body:object=payload,id=registeredUser.id)=>app.inject({method:'PATCH',url:'/api/v1/'+kind+'/'+id,payload:body});
      signedIn=false;expect((await call()).statusCode).toBe(401);signedIn=true;
      for(const forbidden of (kind==='customers' ? ['CASHIER','FINANCE','WAREHOUSE'] : ['CASHIER','FINANCE']) as Array<'ADMIN'|'MANAGER'|'WAREHOUSE'|'CASHIER'|'FINANCE'>){role=forbidden;expect((await call()).statusCode).toBe(403);}
      role='ADMIN';for(const body of [{},{...payload,active:false},{...payload,organizationId:registeredUser.id},{...payload,version:0}])expect((await call(body)).statusCode).toBe(400);
      expect((await call(payload,'bad')).statusCode).toBe(400);
      for(const allowed of (kind==='customers' ? ['ADMIN','MANAGER'] : ['ADMIN','MANAGER','WAREHOUSE']) as Array<'ADMIN'|'MANAGER'|'WAREHOUSE'|'CASHIER'|'FINANCE'>){role=allowed;expect((await call()).statusCode).toBe(200);}
      const update=kind==='customers' ? updateCustomer : updateSupplier;
      expect(update).toHaveBeenCalledWith(input.organizationId,registeredUser.id,registeredUser.id,payload);
      update.mockResolvedValueOnce({ok:false,reason:'PARTY_NOT_FOUND'});expect((await call()).statusCode).toBe(404);
      update.mockResolvedValueOnce({ok:false,reason:'VERSION_CONFLICT'});expect((await call()).statusCode).toBe(409);
    }
  }finally{await app.close();}
  role='ADMIN';const unavailable=await build(customerService,{...suppliers,update:undefined});
  try{expect((await unavailable.inject({method:'PATCH',url:'/api/v1/customers/'+registeredUser.id,payload:{...fields,creditLimit:'0'}})).statusCode).toBe(503);expect((await unavailable.inject({method:'PATCH',url:'/api/v1/suppliers/'+registeredUser.id,payload:fields})).statusCode).toBe(503);}finally{await unavailable.close();}
  const absent=await build(customerService);try{expect((await absent.inject({method:'PATCH',url:'/api/v1/suppliers/'+registeredUser.id,payload:fields})).statusCode).toBe(503);}finally{await absent.close();}
},30000);


it('scopes and authorizes atomic transfer reads/posts, validates keys and returns explicit replay status',async()=>{
  let signedIn=false;let role:'ADMIN'|'MANAGER'|'WAREHOUSE'|'CASHIER'|'FINANCE'='ADMIN';
  const auth={...authenticationService,authenticate:async()=>signedIn ? ({ok:true as const,token:'token',user:{...registeredUser,role}}) : ({ok:false as const,reason:'UNAUTHENTICATED' as const})};
  const payload={productId:registeredUser.id,sourceWarehouseId:registeredUser.id,destinationWarehouseId:input.organizationId,quantity:'1.1250',reason:'Transfer stock',occurredAt:'2026-10-30T10:00:00.000Z'};
  const transfer={...payload,id:registeredUser.id,organizationId:input.organizationId,actorUserId:registeredUser.id,productName:'Shirt',sku:'SH-1',occurredAt:new Date(payload.occurredAt),createdAt:new Date(payload.occurredAt)};
  const service:ReturnType<typeof createInventoryTransferService>={list:vi.fn(async(_organizationId,query)=>({transfers:[transfer],total:1,...query})),post:vi.fn(async()=>({ok:true as const,transfer,replayed:false}))};
  const build=(transfers?:typeof service)=>buildApp(...([successIdentity,auth,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,customerService,salesService,...Array(16).fill(undefined),transfers] as unknown as Parameters<typeof buildApp>));
  const app=await build(service);
  const post=(body:object=payload,key:string|null='transfer-key')=>app.inject({method:'POST',url:'/api/v1/inventory/transfers',headers:key===null ? {} : {'idempotency-key':key},payload:body});
  try{
    expect((await app.inject({method:'GET',url:'/api/v1/inventory/transfers'})).statusCode).toBe(401);expect((await post()).statusCode).toBe(401);signedIn=true;
    for(const forbidden of ['CASHIER','FINANCE'] as const){role=forbidden;expect((await post()).statusCode).toBe(403);expect((await app.inject({method:'GET',url:'/api/v1/inventory/transfers'})).statusCode).toBe(403);}
    for(const allowed of ['ADMIN','MANAGER','WAREHOUSE'] as const){role=allowed;expect((await post()).statusCode).toBe(201);}
    for(const key of [null,' ','x'.repeat(201)])expect((await post(payload,key)).statusCode).toBe(400);
    expect((await post({...payload,sourceWarehouseId:payload.destinationWarehouseId})).statusCode).toBe(400);expect((await post({...payload,organizationId:registeredUser.id})).statusCode).toBe(400);
    expect((await app.inject({method:'GET',url:'/api/v1/inventory/transfers?limit=0'})).statusCode).toBe(400);
    const list=await app.inject({method:'GET',url:'/api/v1/inventory/transfers?limit=20&offset=40'});expect(list.statusCode).toBe(200);expect(service.list).toHaveBeenCalledWith(input.organizationId,{limit:20,offset:40});
    expect(service.post).toHaveBeenCalledWith(input.organizationId,registeredUser.id,'transfer-key',{...payload,occurredAt:new Date(payload.occurredAt)},expect.any(String));
    vi.mocked(service.post).mockResolvedValueOnce({ok:true,transfer,replayed:true});expect((await post()).statusCode).toBe(200);
    vi.mocked(service.post).mockResolvedValueOnce({ok:false,reason:'INSUFFICIENT_STOCK'});expect((await post()).statusCode).toBe(409);
  }finally{await app.close();}
  const unavailable=await build();try{expect((await unavailable.inject({method:'GET',url:'/api/v1/inventory/transfers'})).statusCode).toBe(503);expect((await unavailable.inject({method:'POST',url:'/api/v1/inventory/transfers',headers:{'idempotency-key':'key'},payload})).statusCode).toBe(503);}finally{await unavailable.close();}
},30000);

it('authorizes tenant-scoped physical count posting/listing and validates frozen stock snapshots',async()=>{
  let signedIn=false;let role:'ADMIN'|'MANAGER'|'WAREHOUSE'|'CASHIER'|'FINANCE'='ADMIN';
  const auth={...authenticationService,authenticate:async()=>signedIn ? ({ok:true as const,token:'token',user:{...registeredUser,role}}) : ({ok:false as const,reason:'UNAUTHENTICATED' as const})};
  const payload={warehouseId:registeredUser.id,reason:'Physical count',occurredAt:'2026-10-30T10:00:00.000Z',lines:[{productId:registeredUser.id,expectedQuantity:'1.1250',countedQuantity:'0'}]};
  const count={...payload,id:registeredUser.id,organizationId:input.organizationId,actorUserId:registeredUser.id,occurredAt:new Date(payload.occurredAt),createdAt:new Date(payload.occurredAt),lines:[{...payload.lines[0]!,id:registeredUser.id,productName:'Shirt',sku:'SH-1',difference:'-1.1250',inventoryTransactionId:registeredUser.id}]};
  const service:ReturnType<typeof createStockCountService>={list:vi.fn(async(_organizationId,query)=>({counts:[count],total:1,...query})),post:vi.fn(async()=>({ok:true as const,count,replayed:false}))};
  const build=(counts?:typeof service)=>buildApp(...([successIdentity,auth,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,customerService,salesService,...Array(17).fill(undefined),counts] as unknown as Parameters<typeof buildApp>));
  const app=await build(service);const post=(body:object=payload,key:string|null='count-key')=>app.inject({method:'POST',url:'/api/v1/inventory/counts',headers:key===null ? {} : {'idempotency-key':key},payload:body});
  try{
    expect((await app.inject({method:'GET',url:'/api/v1/inventory/counts'})).statusCode).toBe(401);expect((await post()).statusCode).toBe(401);signedIn=true;
    for(const forbidden of ['CASHIER','FINANCE'] as const){role=forbidden;expect((await post()).statusCode).toBe(403);expect((await app.inject({method:'GET',url:'/api/v1/inventory/counts'})).statusCode).toBe(403);}
    for(const allowed of ['ADMIN','MANAGER','WAREHOUSE'] as const){role=allowed;expect((await post()).statusCode).toBe(201);}
    for(const key of [null,' ','x'.repeat(201)])expect((await post(payload,key)).statusCode).toBe(400);
    expect((await post({...payload,lines:[]})).statusCode).toBe(400);expect((await post({...payload,organizationId:registeredUser.id})).statusCode).toBe(400);expect((await app.inject({method:'GET',url:'/api/v1/inventory/counts?limit=0'})).statusCode).toBe(400);
    expect((await app.inject({method:'GET',url:'/api/v1/inventory/counts?limit=10&offset=20'})).statusCode).toBe(200);expect(service.list).toHaveBeenCalledWith(input.organizationId,{limit:10,offset:20});
    expect(service.post).toHaveBeenCalledWith(input.organizationId,registeredUser.id,'count-key',{...payload,occurredAt:new Date(payload.occurredAt)});
    vi.mocked(service.post).mockResolvedValueOnce({ok:true,count,replayed:true});expect((await post()).statusCode).toBe(200);vi.mocked(service.post).mockResolvedValueOnce({ok:false,reason:'STOCK_CHANGED'});expect((await post()).statusCode).toBe(409);
  }finally{await app.close();}
  const absent=await build();try{expect((await absent.inject({method:'GET',url:'/api/v1/inventory/counts'})).statusCode).toBe(503);expect((await absent.inject({method:'POST',url:'/api/v1/inventory/counts',payload})).statusCode).toBe(503);}finally{await absent.close();}
},30000);

it('authorizes low-stock read models and versioned minimum changes without accepting tenant fields',async()=>{
  let signedIn=false;let role:'ADMIN'|'MANAGER'|'WAREHOUSE'|'CASHIER'|'FINANCE'='ADMIN';
  const auth={...authenticationService,authenticate:async()=>signedIn ? ({ok:true as const,token:'token',user:{...registeredUser,role}}) : ({ok:false as const,reason:'UNAUTHENTICATED' as const})};
  const payload={productId:registeredUser.id,warehouseId:registeredUser.id,minimum:'1.1250',version:0};
  const service:ReturnType<typeof createStockThresholdService>={list:vi.fn(async(_organizationId,query)=>({thresholds:[],total:0,limit:query.limit,offset:query.offset,asOf:new Date()})),set:vi.fn(async()=>({ok:true as const,threshold:{id:registeredUser.id,minimum:'1.1250',version:1}}))};
  const build=(thresholds?:typeof service)=>buildApp(...([successIdentity,auth,userDirectoryService,categoryService,productService,warehouseService,stockService,inventoryMovementService,customerService,salesService,...Array(18).fill(undefined),thresholds] as unknown as Parameters<typeof buildApp>));
  const app=await build(service);const get=()=>app.inject({method:'GET',url:'/api/v1/inventory/thresholds'});const put=(body:object=payload)=>app.inject({method:'PUT',url:'/api/v1/inventory/thresholds',payload:body});
  try{
    expect((await get()).statusCode).toBe(401);expect((await put()).statusCode).toBe(401);signedIn=true;role='CASHIER';expect((await get()).statusCode).toBe(403);expect((await put()).statusCode).toBe(403);role='FINANCE';expect((await get()).statusCode).toBe(200);expect((await put()).statusCode).toBe(403);
    for(const allowed of ['ADMIN','MANAGER','WAREHOUSE'] as const){role=allowed;expect((await put()).statusCode).toBe(200);expect((await get()).statusCode).toBe(200);}
    expect((await put({...payload,organizationId:registeredUser.id})).statusCode).toBe(400);expect((await put({...payload,minimum:'-1'})).statusCode).toBe(400);expect((await app.inject({method:'GET',url:'/api/v1/inventory/thresholds?asOf=invalid'})).statusCode).toBe(400);
    expect((await app.inject({method:'GET',url:'/api/v1/inventory/thresholds?mode=all&limit=10&offset=20'})).statusCode).toBe(200);expect(service.list).toHaveBeenCalledWith(input.organizationId,{mode:'all',limit:10,offset:20});expect(service.set).toHaveBeenCalledWith(input.organizationId,registeredUser.id,payload);
    vi.mocked(service.set).mockResolvedValueOnce({ok:false,reason:'VERSION_CONFLICT'});expect((await put()).statusCode).toBe(409);
  }finally{await app.close();}
  const absent=await build();try{expect((await absent.inject({method:'GET',url:'/api/v1/inventory/thresholds'})).statusCode).toBe(503);expect((await absent.inject({method:'PUT',url:'/api/v1/inventory/thresholds',payload})).statusCode).toBe(503);}finally{await absent.close();}
},30000);

it('returns correlated generic failures without database details and preserves malformed-JSON status',async()=>{
  const auth={...authenticationService,authenticate:async()=>({ok:true as const,token:'token',user:{...registeredUser,role:'ADMIN' as const}})};
  const app=await buildApp(successIdentity,auth,userDirectoryService,{...categoryService,list:async()=>{throw Error('Private database query and credentials');}},productService,warehouseService,stockService,inventoryMovementService,customerService,salesService);
  try{const failed=await app.inject({method:'GET',url:'/api/v1/categories'});expect(failed.statusCode).toBe(500);expect(failed.json()).toEqual({error:'INTERNAL_SERVER_ERROR',requestId:expect.any(String)});expect(failed.body).not.toContain('Private');const malformed=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{'content-type':'application/json'},payload:'{'});expect(malformed.statusCode).toBe(400);expect(malformed.json()).toEqual({error:'INVALID_REQUEST',requestId:expect.any(String)});}finally{await app.close();}
});
