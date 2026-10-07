import { describe, expect, it } from 'vitest';
import { verifyPassword } from '../../../src/modules/identity/password.js';
import { createIdentityService, type StoredUser, type UserRepository } from '../../../src/modules/identity/service.js';

const input = {
  organizationId: '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55',
  name: 'Ahmed Faisal',
  email: 'ahmed@example.com',
  password: 'a-secure-password',
  role: 'ADMIN' as const
};

describe('identity service', () => {
  it('creates a hashed user when the organization email is unused', async () => {
    let created: StoredUser | undefined;
    const repository: UserRepository = {
      findByEmail: async () => null,
      create: async (user) => { created = user; return user; },
      createAuditEvent: async () => undefined
    };

    const result = await createIdentityService(repository).register(input);

    expect(result.ok).toBe(true);
    expect(created?.passwordHash).not.toBe(input.password);
    await expect(verifyPassword(input.password, created!.passwordHash)).resolves.toBe(true);
    if (result.ok) expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('does not create duplicate organization emails', async () => {
    const existing: StoredUser = { id: '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f', ...input, passwordHash: 'not-used', active: true };
    const repository: UserRepository = {
      findByEmail: async () => existing,
      create: async () => { throw new Error('must not create'); },
      createAuditEvent: async () => undefined
    };

    await expect(createIdentityService(repository).register(input)).resolves.toEqual({ ok: false, reason: 'EMAIL_TAKEN' });
  });
});
