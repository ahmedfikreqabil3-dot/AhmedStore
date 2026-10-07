import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

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

describe('API health endpoint', () => {
  it('returns the versioned API health response', async () => {
    const app = buildApp({ register: async () => ({ ok: true, user: registeredUser }) }, authenticationService);
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'api' });
    await app.close();
  });

  it('registers valid users and rejects invalid registration data', async () => {
    const app = buildApp({ register: async () => ({ ok: true, user: registeredUser }) }, authenticationService);

    const created = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: input });
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: {} });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual(registeredUser);
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });

  it('reports duplicate organization emails', async () => {
    const app = buildApp({ register: async () => ({ ok: false, reason: 'EMAIL_TAKEN' }) }, authenticationService);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: input });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'EMAIL_TAKEN' });
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
    const app = buildApp({ register: async () => ({ ok: true as const, user: registeredUser }) }, auth);
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
    const app = buildApp({ register: async () => ({ ok: true as const, user: registeredUser }) }, authenticationService);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { organizationId: input.organizationId, email: input.email, password: 'a-secure-password' } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
