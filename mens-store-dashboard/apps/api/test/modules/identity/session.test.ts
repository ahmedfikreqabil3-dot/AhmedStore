import { describe, expect, it } from 'vitest';
import { hashPassword } from '../../../src/modules/identity/password.js';
import { createSessionService, hashSessionToken, type SessionRepository } from '../../../src/modules/identity/session.js';

const user = {
  id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', organizationId: '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55',
  name: 'Ahmed Faisal', email: 'ahmed@example.com', role: 'ADMIN' as const, active: true, passwordHash: ''
};

async function repository(overrides: Partial<SessionRepository> = {}) {
  const events: string[] = [];
  const base: SessionRepository = {
    findUserByEmail: async () => ({ ...user, passwordHash: await hashPassword('SecurePassword123!') }),
    createSession: async () => undefined,
    findSession: async () => null,
    revokeSession: async () => undefined,
    createAuditEvent: async (event) => { events.push(event.action); }
  };
  return { ...base, ...overrides, events };
}

describe('session service', () => {
  it('hashes opaque tokens deterministically without retaining their value', () => {
    expect(hashSessionToken('token')).toBe(hashSessionToken('token'));
    expect(hashSessionToken('token')).not.toBe('token');
  });

  it('rejects missing, inactive, and invalid credentials', async () => {
    const missing = createSessionService(await repository({ findUserByEmail: async () => null }));
    await expect(missing.login({ organizationId: user.organizationId, email: user.email, password: 'x' })).resolves.toEqual({ ok: false, reason: 'INVALID_CREDENTIALS' });
    const inactive = createSessionService(await repository({ findUserByEmail: async () => ({ ...user, active: false, passwordHash: 'unused' }) }));
    await expect(inactive.login({ organizationId: user.organizationId, email: user.email, password: 'x' })).resolves.toEqual({ ok: false, reason: 'INVALID_CREDENTIALS' });
    const invalid = createSessionService(await repository());
    await expect(invalid.login({ organizationId: user.organizationId, email: user.email, password: 'wrong' })).resolves.toEqual({ ok: false, reason: 'INVALID_CREDENTIALS' });
  });

  it('creates a hashed session and audit event for valid credentials', async () => {
    let createdHash = '';
    const repo = await repository({ createSession: async (session) => { createdHash = session.tokenHash; } });
    const result = await createSessionService(repo, () => new Date('2026-01-01T00:00:00Z')).login({ organizationId: user.organizationId, email: user.email, password: 'SecurePassword123!' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(createdHash).toBe(hashSessionToken(result.token));
    expect(repo.events).toEqual(['AUTH_LOGIN']);
  });

  it('authenticates only an active, current, unrevoked session', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const service = createSessionService(await repository({ findSession: async () => ({ id: 'session', tokenHash: 'hash', expiresAt: new Date('2026-01-01T01:00:00Z'), revokedAt: null, user: { ...user, passwordHash: 'hidden' } }) }), () => now);
    await expect(service.authenticate(undefined)).resolves.toEqual({ ok: false, reason: 'UNAUTHENTICATED' });
    await expect(service.authenticate('token')).resolves.toMatchObject({ ok: true, user: { id: user.id } });
    for (const session of [null, { id: 's', tokenHash: 'h', expiresAt: now, revokedAt: null, user: { ...user, passwordHash: 'x' } }, { id: 's', tokenHash: 'h', expiresAt: new Date('2026-01-01T01:00:00Z'), revokedAt: now, user: { ...user, passwordHash: 'x' } }, { id: 's', tokenHash: 'h', expiresAt: new Date('2026-01-01T01:00:00Z'), revokedAt: null, user: { ...user, active: false, passwordHash: 'x' } }]) {
      const rejected = createSessionService(await repository({ findSession: async () => session }), () => now);
      await expect(rejected.authenticate('token')).resolves.toEqual({ ok: false, reason: 'UNAUTHENTICATED' });
    }
  });

  it('revokes a live session and audits logout while safely ignoring absent sessions', async () => {
    const repo = await repository({ findSession: async () => ({ id: 'session', tokenHash: 'hash', expiresAt: new Date('2026-01-01T01:00:00Z'), revokedAt: null, user: { ...user, passwordHash: 'hidden' } }) });
    let revoked = false;
    repo.revokeSession = async () => { revoked = true; };
    const service = createSessionService(repo);
    await service.logout(undefined);
    await service.logout('token');
    expect(revoked).toBe(true);
    expect(repo.events).toEqual(['AUTH_LOGOUT']);
    await createSessionService(await repository({ findSession: async () => ({ id: 's', tokenHash: 'h', expiresAt: new Date(), revokedAt: new Date(), user: { ...user, passwordHash: 'x' } }) })).logout('token');
  });
});
