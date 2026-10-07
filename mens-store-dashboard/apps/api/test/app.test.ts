import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

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

describe('API health endpoint', () => {
  it('returns the versioned API health response', async () => {
    const app = buildApp({ register: async () => ({ ok: true, user: registeredUser }) });
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'api' });
    await app.close();
  });

  it('registers valid users and rejects invalid registration data', async () => {
    const app = buildApp({ register: async () => ({ ok: true, user: registeredUser }) });

    const created = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: input });
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: {} });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual(registeredUser);
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });

  it('reports duplicate organization emails', async () => {
    const app = buildApp({ register: async () => ({ ok: false, reason: 'EMAIL_TAKEN' }) });
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: input });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'EMAIL_TAKEN' });
    await app.close();
  });
});
