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

Each completed phase records commands, test counts, coverage percentage, source
scope, unresolved issues, and its next phase in this document or the delivery
plan update.
