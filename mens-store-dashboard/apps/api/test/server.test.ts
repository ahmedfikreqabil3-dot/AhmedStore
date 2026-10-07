import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('API server', () => {
  it('starts on an ephemeral port', async () => {
    const app = await startServer(0);

    expect(app.server.listening).toBe(true);
    await app.close();
  });
});
