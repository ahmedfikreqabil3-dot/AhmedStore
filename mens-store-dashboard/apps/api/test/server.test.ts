import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

const identityService = { register: async () => ({ ok: false as const, reason: 'EMAIL_TAKEN' as const }), auditUserCreated: async () => undefined };
const authenticationService = { login: async () => ({ ok: false as const, reason: 'INVALID_CREDENTIALS' as const }), authenticate: async () => ({ ok: false as const, reason: 'UNAUTHENTICATED' as const }), logout: async () => undefined };
const userDirectoryService = { list: async () => [] };
const categoryService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'CATEGORY_EXISTS' as const }) };
const productService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'SKU_EXISTS' as const }) };
const warehouseService = { list: async () => [], create: async () => ({ ok: false as const, reason: 'WAREHOUSE_EXISTS' as const }) };

describe('API server', () => {
  it('starts on an ephemeral port', async () => {
    const app = await startServer(0, identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService);

    expect(app.server.listening).toBe(true);
    await app.close();
  });
});
