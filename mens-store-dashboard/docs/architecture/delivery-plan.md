# Controlled delivery plan

## Global quality policy

Every implementation phase defines its source-coverage scope before code is
added. New or modified application code must reach 100% line, function,
statement, and branch coverage. Generated Prisma client code, build output,
test files, bootstrap entry points, and tooling configuration are excluded;
they contain no business behavior and are validated by build, startup, or tool
commands instead. Business logic is never excluded.

No phase advances without all of its listed exit criteria. A failed check is a
phase failure, not a warning.

## Phase 0 — Architecture baseline

**Status:** Complete on 2026-10-07.

**Deliverables:** current-system review, domain model, permissions matrix, API
conventions, ADRs, measurable targets, and prioritized backlog.

**Dependencies:** access to the legacy application source and current SQLite
transition implementation.

**Validation:** trace each documented legacy flow and permission to source
evidence; review unresolved behavior choices with the business owner.

**Exit criteria:** documents in `docs/architecture/`, ADR 001, and
`docs/backlog.md` cover every known posting flow and explicitly identify
proposed behavior changes.

## Phase 1 — Engineering foundation

**Status:** Complete on 2026-10-07.

**Deliverables:** npm workspace, React/Vite app, Fastify app, shared contracts,
Prisma PostgreSQL schema, Docker Compose definition, type/build/test/coverage
commands, environment template, and legacy isolation.

**Dependencies:** Phase 0 complete.

**Validation:** clean dependency install; TypeScript checks; production build;
Prisma schema validation; unit tests; 100% coverage for executable foundation
source.

**Exit criteria:** all commands are green and the legacy application remains
available from `legacy/`.

## Phase 2 — Identity, tenancy, and access control

**Status:** In progress. Blocked from completion until a real PostgreSQL integration-test service is available.

**Deliverables:** Organization/User/Role/Session/Audit schema migrations,
password/session management, RBAC middleware, organization scoping, and OpenAPI
contract generation.

**Dependencies:** Phase 1 plus a real PostgreSQL integration-test service.

**Tests:** unit tests for auth and authorization; PostgreSQL integration tests
for constraints and organization isolation; API tests for 401/403, invalid
input, duplicate email, session rotation, and audit events.

**Exit criteria:** all protected routes enforce authentication, authorization,
and tenant isolation server-side; all Phase 2 code has 100% coverage.

## Phase 3 — Transactional commerce backend

**Deliverables:** catalogue, warehouse, inventory ledger, customer ledger,
sales, payments, returns, expense/treasury posting primitives, idempotency, and
audit events.

**Dependencies:** Phase 2 accepted.

**Tests:** real PostgreSQL tests for duplicate requests, concurrent sales,
insufficient stock, payment mismatch, partial/full return, rollback, financial
decimal precision, and cross-organization access.

**Exit criteria:** all commerce posting invariants in `domain-model.md` are
transactionally enforced and fully covered.

## Phase 4 — React operations frontend

**Deliverables:** login, application shell, dashboard, catalogue, customer,
POS, sales/returns, inventory, finance, and reporting screens in planned
feature slices.

**Dependencies:** corresponding Phase 3 API domains accepted.

**Tests:** component, accessibility, API-contract, and end-to-end journey tests
against a real API/database; 100% coverage for introduced/modified frontend
application logic.

**Exit criteria:** selected daily workflows run entirely through React/API with
no direct browser-state posting.

## Phase 5 — Repeatable data migration

**Deliverables:** legacy export, import command, dry-run mode, reconciliation
report, backup, rollback procedure, and cutover runbook.

**Dependencies:** Phase 3 data model and Phase 4 parity for the migrated flows.

**Tests:** fixture imports, invalid-data rejection, idempotent rerun, rollback,
and reconciliation of stock, sales, customer balances, and treasury balances.

**Exit criteria:** migration is repeatable/reversible and approved totals match
the legacy baseline before any cutover.

## Phase 6 — Production deployment

**Deliverables:** staging/production environments, container images, managed
PostgreSQL, secrets management, HTTPS, CI/CD, backups, monitoring, alerts, and
operational runbooks.

**Dependencies:** Phase 5 accepted.

**Tests:** restore drill, security scan, deployment smoke test, load test with
100 active users, and p95 normal-operation latency under 500 ms.

**Exit criteria:** 99.9% availability monitoring is configured, backup restore
is proven, and production readiness is approved.

## Phase 7 — Growth and operations

**Deliverables:** evidence-led queues, caching, replicas, integrations, and
capacity improvements only where metrics justify them.

**Dependencies:** live production metrics and operational requirements.

**Exit criteria:** each addition has a measured problem statement, failure-mode
analysis, observability, rollback plan, and passing test suite.
