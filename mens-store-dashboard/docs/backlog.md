# Prioritized product and engineering backlog

## P0 — Foundation and integrity

1. Complete PostgreSQL integration-test environment and Prisma migration workflow.
2. Implement organization/user/session/RBAC/audit model with real PostgreSQL tests.
3. Implement decimal money/quantity value objects and idempotent command handling.
4. Implement products, warehouses, and immutable inventory ledger.
5. Implement transactional sales, payments, and returns with concurrency tests.
6. Implement ENH-02, ENH-08, ENH-09, ENH-10, ENH-12, and ENH-13 as immutable posting workflows.

## P1 — Daily operations

1. Build React login, dashboard shell, catalogue, customer, POS, sales, and returns screens.
2. Implement customer/supplier ledgers, purchase receipts, expenses, treasuries, and shifts.
3. Implement stock transfers, stock adjustments, and low-stock workflows.
4. Add reporting/export APIs and RTL accessible React components.
5. Implement ENH-01, ENH-03 through ENH-07, ENH-11, and ENH-14 with API and UI regression tests.

## P2 — Migration and delivery

1. Repeatable legacy import, dry-run report, reconciliation, rollback procedure.
2. Staging environment, CI/CD, secrets, observability, backup/restore testing.
3. Load test 100 active users and verify p95 normal-operation latency below 500 ms.

## P3 — Growth

1. Background jobs for reports, exports, and notifications.
2. Integrations, multi-branch expansion, operational dashboards, and evidence-led caching.
