# Prioritized product and engineering backlog

Reconciled 2026-10-29 against code and current test evidence. This is an ordered
work queue, not an assertion that everything below is unimplemented. Canonical
states/scores: [progress ledger](architecture/delivery-progress.json).

## Baseline already delivered

- Phase 0 architecture/legacy reference, Phase 1 local engineering foundation,
  Phase 2 exposed identity/session/tenant baseline.
- Core sale/purchase/return/shift posting slices, stock reads and posting primitives,
  master-data read/create/import foundations, sales exports.
- Nine existing live-screen designs and component workflows. These do not
  satisfy the complete legacy/UI scope; see the [audit](architecture/delivery-audit-2026-10-29.md).

## P0 — Restore the current quality and integrity gate

1. DONE — product PATCH/service/repository verification: current 168 API tests pass with
   all four coverage metrics at 100%, including PostgreSQL concurrency and audit rollback.
   B02 archive/lifecycle scope is still open.
2. IMPLEMENTED — B16/F20: safe original-key retry and double-submit controls for purchase,
   replacement, purchase-return and no-invoice request workflows; do not change
   financial policy or widen role grants while doing this. Final browser/whole-cycle
   acceptance remains open. Every financial adapter and application composition is
   now in covered source; `main.ts` only bootstraps.
3. Reconcile API target/actual pagination/error shapes and settle legacy permission,
   warehouse-scope and closed-period requirements before cutover.

## P1 — Phase 4B: master data and administration

1. F11/B05/B11: customer management, lifecycle and account statement dependencies.
2. F12/B05/B11: supplier management, lifecycle and account statements, preserving import.
3. F15/F17/F18: branches, users/approved roles, settings/category management.
4. Deliver missing service/contract/API tests with each live UI slice, including
   customer import and referenced-record archival rules. Extend ENH-03/04/05/14.

## P1 — Phase 4C: financial and stock operations

1. F13 IMPLEMENTED — reviewed expense entry, original-key recovery, date-filtered
   history/detail and exact whole-period totals. F14/B15 treasury account/ledger
   administration and transfers remain.
2. IMPLEMENTED — F16/B03/B04: opening balances, counts/adjustments, atomic stock
   transfers and configurable low-stock controls. 183 API / 216 web / 25 contract
   tests passed at all configured metrics 100%. Browser acceptance remains F20.
3. F24/B11: customer collection and supplier settlement commands, ledgers and views.
4. Reconcile balances from immutable entries; never add direct editable balance fields.

## P1 — Phase 4D: remaining documents and parity

1. F06/B08: full sale/invoice-line read model, invoice-linked return and return-revision UI.
2. F21/B13: quotations, held invoices and idempotent convert-to-sale workflow.
3. F22/B14: purchase-order and separate/partial-receipt lifecycle.
4. F23: printable invoice/receipt templates from actual persisted documents.
5. Complete remaining acceptance of ENH-01/06/08/09/10/11/12/13; retain already
   implemented purchase/return foundations rather than listing them as absent.

## P1 — Phase 4E: reporting and real dashboard

1. F09/F10/B12: live dashboard and dedicated reports centre for sales, purchases,
   stock, customers/suppliers, expenses and treasuries.
2. Consistent report/export filters (ENH-07/14); define cost/profit/valuation
   rules before exposing accounting figures.

## P1 — Phase 4F: acceptance gate

1. F20: real purchase → sale → return → shift reconciliation, including independent
   collections/payments and stock transfers when implemented.
2. Role/tenant/warehouse boundaries, retries, concurrent actions, failure rollback,
   accessible responsive UI, export and print acceptance.
3. Agent prepares and verifies journeys; the user performs required final
   consequential financial confirmations in the operational browser.

## P2 — Phases 5 and 6: migration and production

1. M01–M03: repeatable legacy import/dry run, full ledger/stock reconciliation,
   backups, rollback rehearsal and owner-approved cutover.
2. P01–P04: staging/production, HTTPS/secrets, release CI/CD, monitoring/alerts,
   automated backup and proven restore, security/load tests and go-live approval.
3. Verify 100 active users and p95 normal-operation latency below 500 ms; monitor
   the agreed 99.9% availability target. Local startup is not deployment evidence.

## P3 — Phase 7: after release, excluded from current percentage

Background report/export jobs, integrations, capacity work, caching and replicas
only after live evidence establishes the need. Scope and weights change only
through explicit planning decisions; legacy features are not silently removed.

## Full design scope checkpoint

Complete all interface/journey design, not only the existing nine live screens.
Expanded preview and remaining review details: [journey design](architecture/phase-4-full-journey-design.md).
Next: close B16 retries; refine remaining design interactions before wiring each
4B/4C/4D/4E workspace to its verified backend dependency.
