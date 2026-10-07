# ADR 001: Production platform stack

## Status

Accepted on 2026-10-07.

## Decision

- Web: React, TypeScript, Vite.
- API: Node.js, TypeScript, Fastify.
- Database: PostgreSQL with Prisma migrations.
- Validation: shared Zod contracts.
- Deployment: Docker containers, managed PostgreSQL, separate staging and production environments.

## Context

The legacy application is a single-browser, local SQLite system. The target is
a secure, team-maintained system that can serve more than 1,000 users and be
deployed online. PostgreSQL replaces SQLite as the production source of truth;
the legacy implementation remains available during the controlled migration.

## Consequences

- New domain features are built in `apps/api` and `apps/web`.
- Direct browser writes and browser snapshot persistence are not part of the new platform.
- All schema changes use reviewed Prisma migrations.
- The migration is incremental: a new feature is cut over only after parity,
  automated tests, reconciliation, and acceptance testing.
