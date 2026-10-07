import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

const identityService = { register: async () => ({ ok: false as const, reason: 'EMAIL_TAKEN' as const }) };
const authenticationService = { login: async () => ({ ok: false as const, reason: 'INVALID_CREDENTIALS' as const }), authenticate: async () => ({ ok: false as const, reason: 'UNAUTHENTICATED' as const }), logout: async () => undefined };
const userDirectoryService = { list: async () => [] };

describe('API server', () => {
  it('starts on an ephemeral port', async () => {
    const app = await startServer(0, identityService, authenticationService, userDirectoryService);

    expect(app.server.listening).toBe(true);
    await app.close();
  });
});
