import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('API health endpoint', () => {
  it('returns the versioned API health response', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'api' });
    await app.close();
  });
});
