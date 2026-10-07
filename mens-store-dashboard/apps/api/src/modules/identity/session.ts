import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { LoginInput, PublicUser } from '@ahmed-store/contracts';
import { verifyPassword } from './password.js';
import type { StoredUser } from './service.js';

const sessionLifetimeMs = 8 * 60 * 60 * 1000;

export type StoredSession = {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: StoredUser;
};

export interface SessionRepository {
  findUserByEmail(organizationId: string, email: string): Promise<StoredUser | null>;
  createSession(input: { id: string; organizationId: string; userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findSession(tokenHash: string): Promise<StoredSession | null>;
  revokeSession(id: string, revokedAt: Date): Promise<void>;
  createAuditEvent(input: { organizationId: string; actorUserId: string; action: string; entityType: string; entityId: string }): Promise<void>;
}

export type SessionResult =
  | { ok: true; token: string; user: PublicUser }
  | { ok: false; reason: 'INVALID_CREDENTIALS' | 'UNAUTHENTICATED' };

export interface AuthenticationService {
  login(input: LoginInput): Promise<SessionResult>;
  authenticate(token: string | undefined): Promise<SessionResult>;
  logout(token: string | undefined): Promise<void>;
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function toPublicUser({ passwordHash: _passwordHash, active: _active, ...user }: StoredUser): PublicUser {
  return user;
}

export function createSessionService(repository: SessionRepository, now = () => new Date()): AuthenticationService {
  return {
    async login(input: LoginInput): Promise<SessionResult> {
      const user = await repository.findUserByEmail(input.organizationId, input.email);
      if (!user || !user.active || !(await verifyPassword(input.password, user.passwordHash))) {
        return { ok: false, reason: 'INVALID_CREDENTIALS' };
      }
      const token = randomBytes(32).toString('hex');
      const issuedAt = now();
      await repository.createSession({
        id: randomUUID(), organizationId: user.organizationId, userId: user.id,
        tokenHash: hashSessionToken(token), expiresAt: new Date(issuedAt.getTime() + sessionLifetimeMs)
      });
      await repository.createAuditEvent({ organizationId: user.organizationId, actorUserId: user.id, action: 'AUTH_LOGIN', entityType: 'Session', entityId: user.id });
      return { ok: true, token, user: toPublicUser(user) };
    },
    async authenticate(token: string | undefined): Promise<SessionResult> {
      if (!token) return { ok: false, reason: 'UNAUTHENTICATED' };
      const session = await repository.findSession(hashSessionToken(token));
      if (!session || session.revokedAt || session.expiresAt <= now() || !session.user.active) {
        return { ok: false, reason: 'UNAUTHENTICATED' };
      }
      return { ok: true, token, user: toPublicUser(session.user) };
    },
    async logout(token: string | undefined): Promise<void> {
      if (!token) return;
      const session = await repository.findSession(hashSessionToken(token));
      if (!session || session.revokedAt) return;
      const revokedAt = now();
      await repository.revokeSession(session.id, revokedAt);
      await repository.createAuditEvent({ organizationId: session.user.organizationId, actorUserId: session.user.id, action: 'AUTH_LOGOUT', entityType: 'Session', entityId: session.id });
    }
  };
}
