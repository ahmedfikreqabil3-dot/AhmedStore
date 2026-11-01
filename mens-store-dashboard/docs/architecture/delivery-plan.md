# Controlled delivery plan

## Reconciled status — 2026-10-30

This revision supersedes broad completion claims based only on the visible
screens. The target is the first production release covering the legacy
functional baseline, unless the owner explicitly defers a named capability.

**Current stage:** Phase 4, incomplete. Phase 4A completed design implementation
for the nine existing live screens; it did not complete the frontend scope.
Phase 3 still has open backend work. The API coverage gate has been restored
(253 tests in 51 files, all configured metrics 100%).
Party editing, safe retry controls, atomic stock transfers/counts, movement
controls and configurable low-stock alerts are operational. Customer credit
ledger postings, positive-limit enforcement and customer/supplier statements are
also implemented. All posting adapters and the remaining application composition
are covered source; `main.ts` now only bootstraps the application.
The latest completed web/contract gates passed 255 and 28 tests respectively at
100% in all four metrics. Expense entry, recovery, history and review are operational.

**Estimated scope progress: approximately 56%.** This is a planning estimate,
not test coverage or a measure of elapsed effort. Phase weights total 100;
packages within each phase have equal weight. A package scores 1 for evidenced
implementation, 0.5 for partial/incompletely verified delivery, and 0 for
absent/unverified delivery. Formal acceptance still requires every exit gate.

| Phase | Release weight | Estimated scope delivered | Acceptance state |
| --- | ---: | ---: | --- |
| 0 — Architecture baseline | 5 | 100% | Historical baseline complete; scope reconciled here. |
| 1 — Engineering foundation | 10 | 100% | Local engineering baseline complete. |
| 2 — Identity/tenancy baseline | 10 | 100% | Exposed identity baseline complete; later scope controls remain release gates. |
| 3 — Full transactional backend | 25 | 65.625% | In progress; lifecycle, independent settlements, treasury/documents/reports and accounting controls. |
| 4 — Complete frontend workflows | 30 | 50% | In progress; complete operational bindings and browser acceptance remain. |
| 5 — Migration/cutover | 10 | 0% | Not started/accepted. |
| 6 — Production readiness | 10 | 0% | Not deployed/accepted. |
| 7 — Post-launch growth | Excluded | Not scored | Metric-led work after release. |

Calculation: 5 + 10 + 10 + (25 × 10.5/16) + (30 × 12/24) = 56.40625 points
out of 100, reported as approximately 56%. The precision of the calculation
does not imply precision of the underlying planning estimates.

Package-level evidence and gaps are recorded in
[delivery-progress.json](delivery-progress.json). The current audit, complete
screen inventory and ordered next steps are in
[delivery audit](delivery-audit-2026-10-29.md). These are the source of truth
for future progress updates; changing scope/weights must be disclosed.

## Global quality policy

Every implementation phase defines its source-coverage scope before code is
added. New or modified application code must reach 100% line, function,
statement, and branch coverage. Generated Prisma client code, build output,
test files, bootstrap entry points, and tooling configuration are excluded;
they contain no business behavior and are validated by build, startup, or tool
commands instead. Business logic is never excluded.

No phase is accepted complete without all of its listed exit criteria. A failed
check is a failed gate, not a warning. Domain slices may be developed in parallel
only against the verified dependencies they actually use; starting frontend
work does not imply that all backend domains are complete. Migration/cutover and
production release cannot bypass unresolved financial, security or quality gates.

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

**Status:** Complete on 2026-10-07. A local PostgreSQL 17 integration
environment verifies sessions, audit events, role enforcement, and
organization isolation. The generated OpenAPI document is available at
`/api/v1/openapi.json`.

This completion covers the exposed baseline. It does not claim that user-admin
screens, legacy permission exceptions or future warehouse-scoped grants exist.
Those are explicitly tracked in F17/B16 and must be resolved before cutover.

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

**Status:** In progress, 10.5/16 planning points (65.625%). Catalogue/import,
warehouse stock reads/movements, sales, purchasing with immutable revision and
purchase returns, sales-return posting/approval, expense/treasury posting and
shift operations exist. Purchasing is implemented; the previous statement that
it was entirely open was stale.

Open scope includes product archival/lifecycle, complete party lifecycles and
ledgers/settlements, reporting read models, quotations/held
documents, purchase orders, and multi-treasury administration. See B01–B16.

**Current gate:** 253 API tests in 51 files pass against the isolated test
database, with 100% statements, branches, functions and lines. New product
maintenance tests cover role/tenant scope, version races, duplicate identifiers,
archive-category rejection, atomic audit rollback and unchanged stock/historical
sale snapshots. This closes the coverage regression found in the audit; it does
not complete remaining B02 lifecycle or B16 retry/contract scope. Covered
repositories now include every financial posting adapter and application
composition; excluded `main.ts` only bootstraps. Frontend: 255 tests in
18 files, contracts: 28 tests in 13 files, all configured metrics 100%.

**Deliverables:** all B01–B16 packages in the progress ledger, including the
legacy document/settlement flows. Schema names/enum values alone do not count
as implemented services. Financial retries outside POS must be brought to the
same safe-key/double-submit standard before acceptance.

**Dependencies:** Phase 2 accepted.

**Tests:** real PostgreSQL tests for duplicate requests, concurrent sales,
insufficient stock, payment mismatch, partial/full return, rollback, financial
decimal precision, and cross-organization access.

**Exit criteria:** all commerce posting invariants in `domain-model.md` are
transactionally enforced and fully covered.

## Phase 4 — React operations frontend

**Status:** In progress, 12/24 planning points (50%). The nine existing live
screens have a consistent RTL design. Login/session/navigation, POS, inventory
reading, purchase forms, no-invoice returns and shifts have working UI slices.
Product maintenance and sales detail/return workflows remain partial. There is
no basis for calling the complete Phase 4 scope finished.

**Deliverables:** all F01–F24 packages in the progress ledger. This includes
customer/supplier accounts, collections/payments, expenses, treasuries, branch
and stock administration, users/settings, dashboard/reports, quotations/held
invoices, purchase orders, printing, full invoice returns and real acceptance.
Some are grouped screens rather than one route per package; screen count is
not the scoring denominator.

**Dependencies:** corresponding Phase 3 API domains accepted.

**Tests:** component, accessibility, API-contract, and end-to-end journey tests
against a real API/database; 100% coverage for introduced/modified frontend
application logic.

**Exit criteria:** selected daily workflows run entirely through React/API with
no direct browser-state posting.

### Phase 4A — Approved UI/UX refinement and consistency

**Status:** Design implementation and verification complete for the nine existing
live screens on 2026-10-29; owner visual acceptance pending. Scope approved by
the owner following the UI UX Pro Max review, then extended to all existing
screens. Navy/teal identity and Cairo typography are preserved. This is a
Phase 4 workstream; it does not renumber or complete other phases or establish
feature parity for planned screens that do not yet exist.

**Delivery order:**
1. Readability: increase important helper/table text, improve secondary-text
   contrast, numeric alignment, and keyboard focus visibility.
2. Branch context: identify the selected branch near stock and checkout,
   including the payment review. Never imply an unselected branch has zero stock.
3. Screen actions: remove the generic new-sale shortcut from unrelated preview
   pages; retain each screen's own product/purchase/inventory action.
4. Table/form consistency: spacing, visible currency, touch targets, and readable
   layouts at desktop/mobile widths.
5. Contextual errors: place sale feedback alongside checkout while preserving
   the draft; follow up with field-specific errors across remaining forms.

**Acceptance:** normal small text contrast at least 4.5:1 against its actual
background; explicit branch in checkout review; no whole-page horizontal
overflow at 375px/1440px; keyboard access and no changes to financial posting,
permissions, or original retry keys. Verify affected React logic at the global
100% coverage thresholds. Record visual evidence and obtain owner design review.

**Progress evidence and remaining checks:** see
[Phase 4A UI/UX refinement](phase-4a-ui-ux-refinement.md).
The final screen inventory and review evidence are in
[Phase 4A screen acceptance](phase-4a-screen-acceptance.md).

### Phase 4B — Master data and administration (next workstream)

Deliver F11/F12/F15/F17/F18: customer and supplier management, branches/users,
approved roles and settings/categories. Reuse working read/create/import APIs;
implement missing lifecycle endpoints/tests before claiming the corresponding
screen complete. Product-edit coverage is now verified; finish the remaining B02 lifecycle scope.

### Phase 4C — Inventory and financial operations

Deliver F13/F14/F16/F24 with B04/B11/B15: expenses, treasury accounts/ledgers,
stock counts/adjustments/transfers, customer collections and supplier payments.
Require immutable entries, idempotency, actor audit, tenant/role checks, and
real balance read models. Existing shift panels do not satisfy treasury scope.

### Phase 4D — Complete document workflows

Finish F06/F21/F22/F23 with B08/B13/B14: full sale/invoice-line details and
invoice-linked returns/revisions, quotations/held invoices/conversion, purchase
orders/receipts, and invoice/receipt printing. Purchase UI substeps in
phase-4-purchasing-ui.md use PUR-* IDs to avoid conflict with these milestones.

### Phase 4E — Dashboard and reporting

Deliver F09/F10 and remaining B12 read models: real dashboard aggregates and
sales, purchasing, stock, party-balance, expense and treasury reports. Filters
must also apply to exports where advertised. Profit/valuation definitions must
be agreed against available cost snapshots before presenting those figures.

### Phase 4F — End-to-end acceptance and parity closure

Complete F20/B16 and remaining gaps in F03/F05/F07/F08: safe retries/double-submit
guards, whole commerce reconciliation, all roles/tenants, accessibility, printing,
exports and owner acceptance. The agent prepares/verifies the flows; required
final financial confirmations in the operational browser remain human actions.
No prototype data may be counted as a live feature.

## Phase 5 — Repeatable data migration

**Status:** 0%; M01–M03 not accepted. Ordinary Excel master-data imports and
Prisma schema migrations do not count as legacy business-data migration.

**Deliverables:** legacy export, import command, dry-run mode, reconciliation
report, backup, rollback procedure, and cutover runbook.

**Dependencies:** Phase 3 data model and Phase 4 parity for the migrated flows.

**Tests:** fixture imports, invalid-data rejection, idempotent rerun, rollback,
and reconciliation of stock, sales, customer balances, and treasury balances.

**Exit criteria:** migration is repeatable/reversible and approved totals match
the legacy baseline before any cutover.

## Phase 6 — Production deployment

**Status:** 0%; P01–P04 not accepted. Running localhost and having compose/build
configuration do not establish a deployed, backed-up and monitored production.

**Deliverables:** staging/production environments, container images, managed
PostgreSQL, secrets management, HTTPS, CI/CD, backups, monitoring, alerts, and
operational runbooks.

**Dependencies:** Phase 5 accepted.

**Tests:** restore drill, security scan, deployment smoke test, load test with
100 active users, and p95 normal-operation latency under 500 ms.

**Exit criteria:** 99.9% availability monitoring is configured, backup restore
is proven, and production readiness is approved.

## Phase 7 — Growth and operations

**Status:** Future, after initial production acceptance. Excluded from the
first-release progress denominator because its scope depends on live metrics.

**Deliverables:** evidence-led queues, caching, replicas, integrations, and
capacity improvements only where metrics justify them.

**Dependencies:** live production metrics and operational requirements.

**Exit criteria:** each addition has a measured problem statement, failure-mode
analysis, observability, rollback plan, and passing test suite.

## Complete interface and journey design checkpoint

The user requires the complete interface and journey scope. The expanded isolated
prototype is linked from `design-preview.html#journeys`. Track review coverage and
remaining detailed interactions in [full journey design](phase-4-full-journey-design.md).
Prototype routes do not count as implemented backend-connected packages.
