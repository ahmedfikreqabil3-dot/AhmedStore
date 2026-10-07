import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/modules/identity/password.js';

describe('password hashing', () => {
  it('verifies the original password and rejects a different password', async () => {
    const stored = await hashPassword('a-secure-password');

    await expect(verifyPassword('a-secure-password', stored)).resolves.toBe(true);
    await expect(verifyPassword('another-secure-password', stored)).resolves.toBe(false);
  });

  it('rejects malformed stored values', async () => {
    await expect(verifyPassword('a-secure-password', 'invalid')).resolves.toBe(false);
  });
});
