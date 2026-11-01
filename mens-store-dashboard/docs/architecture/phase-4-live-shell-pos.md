# Phase 4 — live shell and sale entry

## Implemented scope

- The main application uses the approved Cairo/navy/teal RTL layout.
- Authentication restores the server session and supports login/logout.
- Navigation reflects the authenticated role. Existing catalogue, purchasing,
  inventory, finance, and return panels remain available on separate pages.
- Sale entry loads real authorized catalogue/customer/warehouse data, supports
  barcode/SKU search, quantities, exact four-decimal discounts, and split payments.
- Following explicit owner approval, sellers including cashiers load these
  options through `GET /api/v1/pos/options`. Only active records in the session's
  organization are returned. Product purchase costs and customer contact data
  are omitted. Existing inventory-management permissions are unchanged.
- Confirmation posts to the existing authenticated sales API. The dialog and
  draft clear only after a successful server response.
- A pending command is saved in tab session storage before posting. Unknown
  outcomes keep the same payload and idempotency key, including after refresh.
  A definitive conflict permits correction; the client does not claim success.
- The independent design preview remains available for further visual review.
- Rejected sales now preserve the server's structured error code and show an
  actionable Arabic explanation for insufficient branch stock, unavailable
  customer/warehouse/product, excess discount, or mismatched payment totals.
  Unknown codes and non-JSON proxy errors use a safe fallback; raw server
  details are never displayed. A definitive rejection preserves the editable
  draft so the user can correct the branch or quantity.

## Verification

- Web TypeScript check and Vite production build passed.
- 84 web tests passed. Included application sources reached 100% statement,
  line, function, and branch coverage; only bootstrap and tests are excluded.
- A browser-driven sale used dedicated test-only records in the isolated local
  demo database: 2 units at 19.9500, invoice discount 0.1000, total 39.8000.
- Payments and treasury entries were 20.0000 CASH and 19.8000 CARD.
- Stock changed from 5.0000 to 3.0000. Replaying the persisted idempotency key
  returned the same sale, retaining one sale, one inventory issue, and two
  treasury entries.
- Local evidence is in `.local/live-sale-verification.json`; it contains demo
  identifiers and is excluded from Git.
- 125 API tests passed with 100% line, statement, function, and branch coverage,
  including PostgreSQL integration tests in a separate test database.
- Running-API checks proved cashier access to sale options, tenant isolation,
  absence of purchase costs/contact details, anonymous 401 responses, and 403
  responses for broader catalogue, stock, purchasing, reporting, and user access.
- A cashier API sale of 19.9500 was persisted with that cashier as actor, one
  stock issue, one treasury entry, and one audit event. Replaying its key returned
  the same sale. Evidence is in `.local/cashier-access-verification.json` and
  `.local/cashier-sale-verification.json`.
- Browser verification reached the final cashier confirmation for a separate
  disposable 19.90 demo sale. Automatic review requires the human to click that
  final financial confirmation; this browser draft has not been submitted.

## Open items

This verification record is historical. The reused-panel visual refinement has
since been completed for the nine existing live screens (Phase 4A); it does not
complete the frontend feature scope. The home still provides workflow shortcuts;
live dashboard aggregates, printing, customer management and broader commerce
reconciliation remain open. Current scope/gates and progress supersede this
snapshot: see delivery-plan.md and delivery-audit-2026-10-29.md. In particular,
the new product-update code now prevents current API coverage acceptance.

## Subsequent remediation — 2026-10-29

The product-update coverage regression is resolved: 136 API tests in 34 files
pass with 100% statements, branches, functions and lines on the isolated test
database. Earlier failure figures above describe the audit snapshot. Broader
functional gaps and acceptance requirements remain. The expanded interface
prototype is tracked in [full journey design](phase-4-full-journey-design.md).
