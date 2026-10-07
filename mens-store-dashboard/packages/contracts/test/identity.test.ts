import { describe, expect, it } from 'vitest';
import { registerUserSchema, roleSchema } from '../src/index.js';

describe('identity contracts', () => {
  it('normalizes a valid registration email', () => {
    expect(registerUserSchema.parse({
      organizationId: '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55',
      name: 'Ahmed Faisal',
      email: 'AHMED@EXAMPLE.COM',
      password: 'a-secure-password',
      role: 'ADMIN'
    }).email).toBe('ahmed@example.com');
  });

  it('rejects unsupported roles and weak passwords', () => {
    expect(roleSchema.safeParse('OWNER').success).toBe(false);
    expect(registerUserSchema.safeParse({
      organizationId: '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55',
      name: 'A',
      email: 'bad-email',
      password: 'short',
      role: 'OWNER'
    }).success).toBe(false);
  });
});
