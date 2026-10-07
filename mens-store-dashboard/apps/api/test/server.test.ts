import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

const identityService = { register: async () => ({ ok: false as const, reason: 'EMAIL_TAKEN' as const }) };

describe('API server', () => {
  it('starts on an ephemeral port', async () => {
    const app = await startServer(0, identityService);

    expect(app.server.listening).toBe(true);
    await app.close();
  });
});
