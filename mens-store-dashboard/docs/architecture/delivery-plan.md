# Production delivery plan

## Quality gates for every phase

Each phase must meet its explicit exit criteria before the next phase starts:

1. Unit and integration tests pass.
2. New executable source has 100% line, function, branch, and statement coverage.
3. Type checking, linting, and build succeed.
4. Migration and security review evidence is recorded where relevant.

## Phase 0: Architecture baseline - Complete

Define the production stack, target topology, bounded domains, API conventions,
roles, non-functional requirements, and migration approach.

Exit met: ADR 001 is accepted and the quality gates are documented.

## Phase 1: Engineering foundation - Complete

Create the React/API/contracts workspace, test and coverage enforcement, and
the PostgreSQL Prisma schema baseline.

Exit met on 2026-10-07: clean install, type checks, builds, Prisma schema
validation, tests, and 100% coverage for all executable Phase 1 source pass.

## Phase 2: Identity and access

Implement organization, users, sessions, role-based permissions, audit events,
and security controls.

## Phase 3: Core commerce

Implement products, warehouses, inventory ledger, customers, POS sales,
payments, and returns as transactional PostgreSQL workflows.

## Phase 4: Operations and reporting

Implement purchasing, expenses, treasury, customer balances, reports, exports,
and background jobs.

## Phase 5: Migration and production readiness

Import/reconcile legacy data, deploy staging, load test, run backup/restore
drills, and complete a controlled production cutover.
