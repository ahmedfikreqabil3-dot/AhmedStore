import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

const identityService = { register: async () => ({ ok: false as const, reason: 'EMAIL_TAKEN' as const }), auditUserCreated: async () => undefined };
const authenticationService = { login: async () => ({ ok: false as const, reason: 'INVALID_CREDENTIALS' as const }), authenticate: async () => ({ ok: false as const, reason: 'UNAUTHENTICATED' as const }), logout: async () => undefined };
const userDirectoryService = { list: async () => [] };
const categoryService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'CATEGORY_EXISTS' as const }) };
const productService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'SKU_EXISTS' as const }) };
const warehouseService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'WAREHOUSE_EXISTS' as const }) };
const stockService = { quantityAsOf: async () => '0.0000' };
const inventoryMovementService = { post: async () => ({ ok: false as const, reason: 'PRODUCT_UNAVAILABLE' as const }) };
const customerService = { list: async () => [], create: async () => ({ ok: true as const, customer: { id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', organizationId: '', legacyId: null, name: 'Mohamed Ali', phone: null, email: null, address: null, notes: null, creditLimit: '0.0000', active: true, version: 1 } }) };
const salesService = { post: async () => ({ ok: false as const, reason: 'INSUFFICIENT_STOCK' }) };

describe('API server', () => {
  it('starts on an ephemeral port', async () => {
    const app = await startServer(0, identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService);

    expect(app.server.listening).toBe(true);
    await app.close();
  });
});
