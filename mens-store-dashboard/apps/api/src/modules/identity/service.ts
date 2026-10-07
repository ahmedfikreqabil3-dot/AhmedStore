import { randomUUID } from 'node:crypto';
import type { PublicUser, RegisterUserInput } from '@ahmed-store/contracts';
import { hashPassword } from './password.js';

export type StoredUser = PublicUser & { passwordHash: string; active: boolean };

export interface UserRepository {
  findByEmail(organizationId: string, email: string): Promise<StoredUser | null>;
  create(user: StoredUser): Promise<StoredUser>;
}

export type RegistrationResult =
  | { ok: true; user: PublicUser }
  | { ok: false; reason: 'EMAIL_TAKEN' };

export function createIdentityService(repository: UserRepository) {
  return {
    async register(input: RegisterUserInput): Promise<RegistrationResult> {
      const existing = await repository.findByEmail(input.organizationId, input.email);
      if (existing) return { ok: false, reason: 'EMAIL_TAKEN' };

      const user = await repository.create({
        id: randomUUID(),
        organizationId: input.organizationId,
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash: await hashPassword(input.password),
        active: true
      });
      const { passwordHash: _passwordHash, active: _active, ...publicUser } = user;
      return { ok: true, user: publicUser };
    }
  };
}
