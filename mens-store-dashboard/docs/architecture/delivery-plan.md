# Controlled delivery plan

## Owner-approved core status — 2026-11-02

**Current stage:** Phase 6 implementation delivered; hosted operational acceptance
is pending. Phases 3, 4 and 5 are **100% of owner-approved core scope**. The full
regression now passes 335 API, 355 web/design and 35 contracts tests (725 total),
plus the legacy business script. Seven fresh migration tests and eight restricted
role/backup tests also pass. No full-source 100% coverage claim is made.

The owner accepted Phase 5 and authorized applying the opening-balance migration
after backup verification. Migration `20261102005000_customer_opening_balances`
is applied to demo; 31 migration checksums match. Backup/restore verified 41 tables
and schema; business fingerprints and financial balances were preserved. Runtime
least-privilege hardening separately preserved all 41 table fingerprints. Demo
API/web remained running. Real legacy cutover is manual using the new CLI when
the source data is ready. See [migration runbook](../operations/phase-5-migration.md).

Production build/deployment/HTTPS templates, environment checks, health/readiness,
structured logs, protected metrics, monitoring hooks, encrypted backup/restore,
security controls and baseline tests are implemented. Local HTTPS desktop/mobile
checks and 100 concurrent authenticated reads passed the 1000ms baseline with
p95 646ms and no failures. Docker/container execution, public host activation,
external alerts and the historical sustained 500ms target are not certified.
These remain release gates, not newly deferred features. See
[production handoff](../operations/production-readiness.md) and
[verification](../operations/phase-6-verification.json).

**Broader release acceptance: 96.25%.** All requested implementation artifacts are
delivered; this percentage preserves the original Phase 6 operational gates.
Previously postponed features and hardware checks remain in
[post-launch deferrals](post-launch-deferrals.md).

| Phase | Core release weight | Accepted | Acceptance state |
| --- | ---: | ---: | --- |
| 0 — Architecture | 5 | 100% | Baseline complete. |
| 1 — Engineering | 10 | 100% | Baseline complete. |
| 2 — Identity/tenancy | 10 | 100% | Core complete. |
| 3 — Transactional backend | 25 | 100% | Core owner accepted. |
| 4 — UI/workflows | 30 | 100% | Core owner accepted. |
| 5 — Migration/trial cutover | 10 | 100% | Owner accepted; real legacy cutover manual. |
| 6 — Production readiness | 10 | 62.5% | Implementation delivered; hosted operational gates pending. |
| 7 — Post-launch growth | Excluded | Not scored | Existing deferral register unchanged. |

Calculation: 5 + 10 + 10 + 25 + 30 + 10 + 6.25 = 96.25.
Package evidence is recorded in [delivery-progress.json](delivery-progress.json).

## Core acceptance decision

The owner's 2026-11-02 decision supersedes the historical all-scope exit gates for
Phases 3/4. Their core acceptance uses the full passing regression, critical
financial/role/branch checks and explicit owner sign-off. Remaining coverage
expansion and physical printer checks are post-launch items. Financial integrity
and production security/readiness gates are not waived.

## Historical full-scope quality target (post-launch expansion)

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

**Status:** In progress, 12.5/16 planning points (87.5%). Catalogue/import,
warehouse stock reads/movements, sales, purchasing with immutable revision and
purchase returns, sales-return posting/approval, expense/treasury posting and
shift operations exist. Purchasing is implemented; the previous statement that
it was entirely open was stale.

Open scope includes remaining product/party lifecycle controls, quotations/held
documents, purchase orders and advanced treasury administration. Reporting and
independent settlements now have implemented core slices. See B01–B16.

**Current gate:** 314 API tests in 62 files and 34 contract tests in 18 files
pass with all four configured coverage metrics at 100%. API/web TypeScript and
the production web build pass. The full web gate passed 342 tests in 31 files with all four metrics at 100%. Native Edge verified invoice details,
linked return/revision, A4 invoices and 80mm receipts at desktop/tablet/mobile.
These gates do not declare all remaining packages complete.

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

**Status:** In progress, 18.5/24 planning points (89.583%). The live operational
screens have a consistent RTL design. Login/session/navigation, POS, inventory
reading, purchase forms, no-invoice returns and shifts have working UI slices.
Core sales detail/return/revision and sales printing workflows are implemented. Product lifecycle and other uncompleted packages remain open. There is
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

**Status:** 100% owner-approved core scope. Templates, validated idempotent CLI,
exact reconciliation, dry-run/rollback/reapply and isolated restore are verified.
The approved opening-balance migration is applied to demo after verified backup.
Real legacy export/mapping and cutover are manual when the owner is ready.
See [migration evidence](../operations/phase-5-trial-verification.json) and
[current activation evidence](../operations/phase-6-verification.json).

## Phase 6 — Production readiness and deployment acceptance

**Status:** implementation delivered; 62.5% of broader release acceptance.
P01/P02/P04 each retain half credit until hosted gates have evidence; P03's
automated encrypted backup/restore drill is verified. No public deployment or
signed go-live is claimed.

**Delivered:** production API/web/container templates, separate owner/runtime
secrets, strict environment checks, HTTPS/reverse proxy, CI verification pipeline,
health/readiness, JSON logs, protected Prometheus metrics/rules, backup schedule,
encrypted online backups, verified fresh restores, headers/origin/rate hardening,
restricted-role trade/RBAC tests and local HTTPS capacity baseline.

**Verified:** 41-table final backup/restore, 725 regression tests, 7 migration
and 8 production-critical tests; baseline 100 concurrent reads, p95 646ms, zero
failures. Dependency audit: no high/critical, 11 moderate and 1 low remain.

**Remaining operational gates:** execute Docker images/CI on a capable host;
real domain/public HTTPS, secrets and external alert delivery; residual advisory
review; sustained representative workloads against the original p95 <500ms
and 99.9% uptime monitoring goals. Real legacy cutover remains owner-operated.
Existing advanced/hardware deferrals are unchanged.

See [production runbook](../operations/production-readiness.md) for activation,
backup, restore, rollback and exact limits of this local verification.

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
