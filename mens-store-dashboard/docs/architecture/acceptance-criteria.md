# Measurable acceptance criteria

## Functional integrity

- No successful sale, payment, return, stock transfer, adjustment, expense, or
  customer payment can leave partial records after a process failure.
- Product stock, customer balance, supplier balance, and treasury balance are
  derived from immutable transaction ledgers.
- Retries with the same idempotency key produce one posting and the same response.
- Every financial and stock total is calculated as PostgreSQL `numeric(19,4)`.

## Security

- Secrets are supplied by environment/secret manager only; no production secret
  is committed to Git.
- Passwords use a cryptographic password hash; sessions are secure, HTTP-only,
  rotated, and revocable.
- Every API write validates input, authenticates the user, authorizes action and
  scope, and produces an audit event when sensitive.

## Reliability and performance

- The migration creates verified backups before import and supports rollback.
- Production has automated backups and a tested restore procedure.
- At 100 concurrent active users, normal API operations achieve p95 latency
  below 500 ms under the agreed load-test profile.
- Availability/error/latency/database connection metrics support a 99.9%
  availability target.

## Phase test evidence

Latest completed gate snapshot (2026-10-30): API 253 tests / 51 files, frontend 255 tests /
18 files and shared contracts 28 tests / 13 files passed with 100% configured
statements, branches, functions and lines. API, web and design TypeScript checks
passed. Earlier results in the audit are historical and superseded.
`main.ts` is now only bootstrap; all financial adapters and remaining composition
are included in measured source. Expense entry/history/recovery is included in
this completed snapshot, along with 38 isolated prototype journey tests.
Read-only browser sweeps passed for 72 prototype and 33 live viewport captures;
native dialog return-focus was corrected, and live customer/supplier statements
passed desktop/mobile layout, error and close-focus checks. Full role/branch,
financial confirmation, physical-print and final owner acceptance remain open.
A passing jsdom suite does not establish those browser/printer acceptance gates.
See [full journey design](phase-4-full-journey-design.md) and
[scored scope](delivery-progress.json); prototype design is not live feature acceptance.

Each completed phase records commands, test counts, coverage percentage, source
scope, unresolved issues, and its next phase in this document or the delivery
plan update.
