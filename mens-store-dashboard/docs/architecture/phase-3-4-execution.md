# Phase 3/4 execution ledger

Owner instruction (2026-10-30): finish incomplete interface designs and journeys,
then continue until backend Phase 3 and frontend Phase 4 meet their exit gates.
Prototype completion alone is not operational delivery. No phase is accepted
merely because a subset of tests passes.

## Work in this execution

- Added count sheets, opening/adjustment/paired-transfer review and settlement
  allocation design. These remain local fixtures, without financial posting.
- Added scoped persistent command recovery for purchase creation, immutable
  purchase replacement, purchase returns and no-invoice return submission.
  Persist-before-send, frozen payload/time/key, synchronous duplicate guards,
  recovery after remount, separate organization/user/operation scopes and
  unreadable-storage blocking are tested. Finance approval has a synchronous guard.
- Web gate after command recovery: 137 tests passed; all four configured coverage
  metrics 100%. Subsequent party UI additions require a fresh gate result.
- Added strict versioned customer/supplier profile contracts and scoped atomic
  update adapters, optimistic concurrency, duplicate mapping and actor audit.
  Real PostgreSQL isolation/race/rollback tests use the separate test database.
- Added operational customer/supplier list/create/review/edit pages. Account
  statements, archival and settlements remain separate work, not fake balances.

## Remaining order

1. Verify the current customer/supplier slice and close any coverage/test failures.
2. Complete master-data lifecycle: product/category/party/warehouse archive and
   restoration, user administration, approved scopes and settings. Status writes
   require eligibility checks and posting-time rechecks, not only hidden UI buttons.
3. B04 stock transfer/count/threshold controls implemented; complete B11 party ledgers and
   independent settlement, B15 multiple treasury accounts and controlled transfers.
4. Complete B13 quotation/held conversion and B14 purchase-order/receipt lifecycle,
   full invoice detail/return/revision UI and operational print templates.
5. Complete B12/F09/F10 real read models, filtered reports and matching exports.
6. Full role/tenant/retry/accounting reconciliation, accessibility/mobile/print
   and owner acceptance. Final operational financial browser actions remain human
   confirmations; integration tests are separate disposable database fixtures.

## Verified operational checkpoint — 2026-10-30

- API: 159 tests in 40 files; web: 158 tests in 12 files; contracts: 23 tests
  in 8 files. All configured statement/branch/function/line metrics were 100%.
  The web run includes 24 design interaction cases, without browser acceptance.
- Atomic branch transfers now have tenant-composite foreign keys, positive and
  different-warehouse database checks, serializable paired entries, bounded
  conflict retry, transaction-local replay, actor audit and paginated live UI.
- Versioned customer/supplier editing is operational. Archive/restore and
  statements are still open. Original-key recovery is implemented for purchase,
  replacement, purchase return and no-invoice request flows, with persisted
  snapshots and duplicate guards. A later authorization rejection never erases
  an earlier uncertain attempt.
- Sales posting was extracted from bootstrap into covered code. Real database
  tests exposed a backdated oversell: a sale could consume stock already needed
  by a later transaction. The shared historical-floor check now uses exact
  four-decimal BigInt units. All later balances must stay sufficient.

The later full gate passed 168 API tests / 41 files, 173 web tests / 13 files
and 23 contract tests / 8 files, all configured metrics 100%. This includes
transaction-local sale replay/master-data rechecks and extracted opening/
adjustment posting. Negative/repeated openings and historically unsafe negative
adjustments are rejected. Local API and preview HTTP checks returned 200.

Physical counts are now implemented with immutable header/line snapshots,
expected-balance concurrency validation, exact discrepancies, paired audit,
historical-floor protection and original-key replay. Zero differences create
count evidence without a zero inventory entry. Tenant foreign keys, exact
difference/count checks and adjustment links are also database constraints.
Seven dedicated PostgreSQL tests passed; the full API gate subsequently passed
176 tests / 42 files at 100% configured coverage. Contracts: 24 tests / 9 files,
100%. The live count UI preserves actual counted quantities when refreshing a
changed snapshot and requires another review. Its 18 targeted tests passed;
the new full web gate is pending after optimizing the 100-product UI-limit test.
An earlier full web run timed out in that test; it is not accepted as green.

Design completion: multiline quotation/held/order editing and purchase entry,
details, split settlement, return and immutable replacement are now local
reviewable journeys. Thirty-four design interaction tests passed. Actual
responsive/keyboard/print and owner acceptance remain unverified.

Latest stock checkpoint: 183 API tests / 43 files, 216 web tests / 15 files,
25 contract tests / 10 files at 100% configured metrics. Stock counts, opening/
adjustments, paired transfers and versioned thresholds/low-stock read models
are operational. API/web/design TypeScript and both production builds passed.
Scope estimate is 54.53125 points, approximately 55%; Phase 3 65.625%, Phase 4
43.75%. These are implementation estimates, not phase acceptance.

Current work after that checkpoint: purchase, purchase-return and immutable
purchase-revision Prisma adapters extracted from main.ts. Bounded write-conflict
retry and transaction-local key replay protect overlapping identical requests.
New purchase/replacement master-data checks and actor permission checks run
inside the write transaction. Purchase return/replacement stock checks now
preserve all later historical balances; existing conservative replacement
eligibility is retained. Eleven real PostgreSQL scenarios plus existing service
tests passed (22 targeted tests); fresh full API coverage is running. Remaining
return/approval/expense/shift/read adapters in main.ts still require extraction.

## Covered application composition — 2026-10-30

The sale, purchase, purchase-return/replacement, sale-return/replacement,
no-invoice approval, expense and shift Prisma adapters now live in covered
modules. The latest completed broad gate before the composition move passed
220 API tests with all configured coverage metrics at 100%.

`src/main.ts` now only creates Prisma, composes services and starts the server.
The remaining foundation adapters are in covered `src/services.ts`, without a
coverage exclusion. Eight real PostgreSQL composition tests pass, including
scoped catalogue/party/history reads, hashed session login/logout, audited atomic
imports and rollback, immutable sale snapshots and personal shift ownership.
The composition file itself reached 100% in all four metrics. Its targeted run
does not meet the global threshold because it deliberately omits other suites;
a fresh complete API gate is running before the next release claim.

The integrated browser tool did not respond in recent design reviews. The owner
explicitly authorized local Playwright visual testing on 2026-10-30. A project-
local Python Playwright installation is ready, using a separate headless browser
profile. Desktop/mobile/keyboard review is in progress; no visual acceptance is
inferred from jsdom/HTTP health, and actual financial confirmations remain human.

Owner credit decision (2026-10-30): zero credit limit means unlimited credit;
positive limits need transactional outstanding-balance enforcement in B11.

Visual evidence: 24 prototype destinations at three widths passed document-
overflow and uncaught-error checks (72 captures). Eleven live destinations at
the same widths also passed (33 captures), using authenticated read-only UI
navigation and blocking operational writes. Both sweeps used isolated contexts.
Native browser checks found and fixed prototype-dialog return focus. The 34
prototype interaction tests pass. See `visual-review-2026-10-30.md` for the sample
manual inspection, evidence limits and remaining acceptance gates.
## Customer credit and real account statements — 2026-10-30

The owner confirmed zero means unlimited. The new immutable customer ledger is
posted atomically with credit sales and credit returns, including explicit
original/reversal/replacement history. A positive credit limit is checked against
current debt inside the serializable posting transaction, with bounded retry.
29 targeted sale/return/precision tests passed, including concurrent remaining-
allowance contention, original-key replay after a limit change and audit rollback.
The migration was verified on the isolated test database, then applied locally;
the local runtime role has SELECT/INSERT only on the customer ledger. Historical
credit backfill rejects ambiguous unlinked reversals instead of inventing dates.

Real customer and supplier statements now include opening, period, closing and
running balances, exact four-decimal amounts and server pagination. Boundary
tests found and corrected implicit timezone conversion in raw SQL. Stock alert
historical comparisons received the same explicit UTC treatment and a millisecond
boundary regression. Broader gates and the live statement browser review are in
progress. Independent settlements and treasury accounts remain open, so B11 and
F11/F12 retain their partial scores. No prototype is counted as a live feature.
## Expense workspace and order design completion — 2026-10-30

Live expenses now provide exact reviewed entry, stable command recovery,
date-filtered paginated history, whole-period totals and immutable detail.
Zero amounts with leading zeroes are rejected. The history API retains
organization and finance-role boundaries and repeatable-read totals/pages.
Latest broad gates passed: 244 API tests / 50 files, 242 web tests / 17 files,
27 contract tests / 12 files, with all four source coverage metrics at 100%.

38 prototype journey tests pass after adding cancellation of outstanding order
quantities, completed/cancelled receipt guards and exact four-decimal receipt
quantities. Two desktop/mobile browser passes each checked the live expense
review (stopping before posting) and prototype cancellation/partial receipt.
All four captures had no document overflow or uncaught error, and no operational
write was attempted. Initial browser review hit API startup before readiness;
the rerun passed, and Start-Local now waits for health/readiness before reporting
success. F13 is now implemented; F22 remains a prototype until B14 is bound.
The scored scope is 55.78125/100 (about 56%): Phase 3 65.625%, Phase 4 47.9167%.
Closed-period policy is awaiting the owner's answer; independent work continues.

## Core delivery checkpoint — 2026-11-01

- Added seven live reports: sales/returns, purchases/returns, cumulative inventory,
  expenses, signed treasury movement, customer debt and supplier debt. All are
  tenant scoped; financial values and XLSX cells retain four decimal places.
  Totals precede pagination. Export rejects over 10,000 rows instead of truncating.
- Added the complete customer-import interface with review, guarded submission,
  saved original bytes/key, scoped recovery and refresh on success. Files are
  limited to 1 MiB / 1,000 customers. No existing customers are overwritten.
- Implemented the approved personal closed-shift sale/return posting policy,
  covering invoice returns, revisions, no-invoice requests and finance approval.
  The interval is [openedAt,closedAt), consistent with shift totals. Corrections
  use a new current-date document. Replays do not post again. Cash reconciliation
  is revalidated inside the serializable close transaction; a concurrent-sale
  PostgreSQL test proves stale close cannot succeed.
- API: 282 tests / 57 files, configured source coverage 100% in all four metrics.
  Contracts: 30 tests. Report/import UI: 15 tests, all coverage metrics 100%.
  Final full-web gate: 271 tests / 20 files passed with all four source coverage
  metrics at 100%. Contract coverage also passed all four metrics at 100%.
- Native review: seven reports at 1440px and 390px, filtered reads and workbook
  downloads, plus customer-import preview at both widths. No final import or
  other business writes were allowed. Corrected mobile fieldset sizing.
- Final production web build and API/web/design TypeScript checks passed.
  Both local services passed readiness after loading the final API.
  Earlier workspace-credit review
  failures are historical; current authorized commands are executing.
- Scope estimate: Phase 3 68.75%, Phase 4 56.25%, weighted total 59.0625%.
  Remaining scope includes settlements/treasuries, quotations/held sales, purchase
  orders/receipts, dashboard/admin bindings and full owner/commerce acceptance.
  This core checkpoint does not declare either phase fully complete.

## Treasury core checkpoint — 2026-11-01

- Implemented accounts/openings, default assignment for existing posting methods,
  paired transfers, exact current/period/running balances, customer collections,
  supplier payments and optional invoice allocations. New document timestamps
  come from the server. All financial postings/audits are atomic and replayable.
- Real PostgreSQL tests cover tenant/method constraints, invoice credit returns,
  allocation caps, rollback, matching-key concurrency and forced overlapping
  withdrawals. New movement types feed statements, reports and shift totals.
- Gates: 295 API tests / 59 files, 283 web tests / 21 files, 32 contracts / 16 files;
  all four source coverage metrics passed at 100%. TypeScript and web build passed.
- Playwright posted one zero-opening account, one paired transfer, one collection
  and one supplier payment only in disposable ahmed_store_api_tests fixtures via
  guarded port 3001. Cash, card, customer and supplier balances were reconciled.
  Desktop/tablet/mobile review produced 15 captures with no page overflow, alerts,
  browser errors or failed responses. Test fixtures and test API were removed.
- Demo treasury migration/grants were rejected by automatic approval review for
  lack of explicit financial-database change approval. No workaround was used.
  A separate read-only database backup was verified against all 33 demo tables.
  Current activation requires approval under docs/operations/treasury-rollout.md;
  the new API fails fast on a missing treasury schema or table grants.
- Scope estimate: Phase 3 75%, Phase 4 62.5%, weighted total 62.5% (rounded 63%).
  This measures evidenced implementation, not demo deployment or phase acceptance.
  Advanced treasury maintenance is deferred; invoice details, linked returns and
  printing are the next core implementation work after the activation gate.


## Approved treasury activation and invoice checkpoint — 2026-11-01

- Explicit owner authorization resolved the earlier activation block. Applied
  both treasury migrations and SELECT/INSERT grants on all four new tables.
  Historical fingerprints/counts matched all 32 business tables; organization
  and payment-method account links passed. API restarted; authenticated treasury
  and sales-document reads passed on the local demo without financial writes.
- Added tenant-scoped immutable sales documents, cashier own-sale access,
  paginated/filterable history, linked partial returns and replacement revisions.
  Financial confirmation retains original pending commands and idempotency keys.
- Added sales invoice A4/80mm and linked-return 80mm printing, including the last
  successful POS invoice. Printed data is escaped; original and voided document
  status is retained. System print fonts avoid blocked web-font readiness.
- Native Edge posted a 0.5-unit CREDIT return and replaced it with 0.25 units in
  the disposable test organization only. Reconciliation proved returned quantity
  0.2500, stock 5.2500, customer debt 95.0000 and unchanged cash/card balances.
  Subsequent read-only visual review passed at 1440/768/390px, including nine
  print captures, with no overflow, browser errors or failed/blocked responses.
  Physical printing was stubbed. Evidence: .local/invoice-cycle-verification.json
  and .local/design-review/2026-11-01/invoices/results.json.
- Gates: 300 API tests/60 files and 33 contract tests/17 files; all four source
  metrics 100%. API/web TypeScript and production web build passed. Final web
  gate passed 299 tests/25 files with all four source metrics at 100%. Disposable
  invoice fixtures and the isolated test API were removed after reconciliation.
- Estimated scope: Phase 3 75%, Phase 4 66.667%, overall 63.75% (rounded 64%).
  Neither phase is accepted complete. Account renaming/archival, purchase and
  settlement printing, configurable document templates and remaining operational
  packages are deferred according to the progress ledger.


## Live dashboard core checkpoint — 2026-11-01

- Replaced the navigation-only home for ADMIN/MANAGER/FINANCE with live exact
  sales, expenses and customer/supplier balance summaries. CASHIER/WAREHOUSE
  keep their permitted operational shortcuts without financial summary reads.
- Reused the existing tenant-scoped report API in parallel; no schema changes,
  financial writes or new dependencies. Sales totals include returns; party
  balances are cumulative through the end date. Comparison uses the immediately
  preceding period with the same number of UTC calendar days. Large decimal
  totals and signed comparisons never pass through floating-point numbers.
- Added date validation, loading/error/retry/empty states, cancellation, latest
  five sale/return documents and links to authorized detailed reports/sales.
- Targeted dashboard and shell gates: 19 tests, all four coverage metrics 100%.
  TypeScript and production web build passed. Native Edge verified historical
  totals against actual authenticated reports at 1440/768/390px, with no overflow,
  alerts or browser errors. The route guard blocked all financial writes.
  Evidence: .local/dashboard-web-targeted.log, .local/dashboard-build.log and
  .local/design-review/2026-11-01/dashboard/results.json.
- F09 remains partial: time-series charts and richer exception summaries are
  deferred. Estimated scope is Phase 3 75%, Phase 4 68.75%, total 64.375%.
- Final full web gate: 308 tests/26 files, all four source coverage metrics
  100%. Evidence: .local/dashboard-web-final.log. Existing API (300) and
  contract (33) gates remain unchanged; no backend or contract source changed.


## Branch/category core checkpoint — 2026-11-01

- Added role-gated live branch and category pages with listing, name search,
  validated creation, duplicate protection and loading/error/empty feedback.
  Uses the existing tenant-scoped API; no backend/schema changes. An uncertain
  create response preserves the name and reloads the authoritative list before
  another attempt. Synchronous submission protection prevents duplicate clicks.
- Returning to POS refreshes product/customer/branch choices without clearing
  cart lines, selections or pending-sale state. A regression test verifies the
  new branch option and retained cart/selections, plus listener cleanup.
- Native Edge created exactly one branch and category only in the disposable
  test organization. Both persisted after reload and were reviewed at
  1440/768/390px. A new branch appeared in POS without reloading the application.
  No overflow, UI alerts, browser errors or unexpected failed responses occurred.
  Expected signed-out /auth/me 401 checks are separately classified by the
  browser verifier. No financial documents or inventory movements were created.
- Final web gate: 319 tests/27 files, all four coverage metrics at 100%.
  TypeScript and production build passed. API (300) and contracts (33) source
  and gates remain unchanged. Evidence: .local/master-data-web-final.log,
  .local/master-data-browser-verification.json and
  .local/master-data-verification.log; six native captures are under
  .local/design-review/2026-11-01/master-data/.
- F15/F18 remain partial: editing/archival and broader settings are deferred.
  Phase 3 stays at 75%; Phase 4 is 72.917%; weighted scope is 65.625% (66%).
  Core user administration is the next operational binding.


## User administration core checkpoint — 2026-11-02

- Added ADMIN-only user directory/search and account creation with the existing
  approved role enum; defaults to CASHIER. Shared schema validates and normalizes
  input. Passwords remain outside browser storage and clear after submission.
  Uncertain responses reload the directory and never automatically replay credentials.
- Native Edge created one cashier only in an isolated organization, confirmed its
  persisted role, successful login and server-side 403 for /users. Desktop,
  tablet and mobile checks passed without overflow, alerts or browser errors.
  Password hashing and the USER_CREATED audit were verified. No financial
  documents were posted; the disposable organization and test API were removed.
- Local API/web were restarted; authenticated demo user-directory reads passed.
  TypeScript and production build passed. The final web gate is recorded below.
  Evidence: .local/users-posting-verification.log,
  .local/users-demo-read-verification.json and
  .local/design-review/2026-11-02/users/results.json.
- F17 remains partial: role changes, disable/reset and warehouse-specific grants
  are deferred. Phase 3 75%, Phase 4 75%, weighted scope 66.25%. Next core work is
  quotation/held-invoice lifecycle and safe sale conversion, followed by its UI.
- Final web gate: 328 tests/28 files; statements, branches, functions and lines
  all 100%. Evidence: .local/users-web-final.log. Report date-input coverage now
  remains independent of the current date. Existing API (300) and contracts (33)
  gates are unchanged; no backend or contract application source changed.


## Quotation/held-invoice core checkpoint — 2026-11-02

- Added scoped persisted drafts with immutable kind, versioned edits, cancellation,
  retained product/customer/branch snapshots and a private conversion key.
  Creation is replayable by the original command. Drafts never reserve stock or
  post money. Cashiers can read/change only their own drafts; finance is read-only.
- Conversion locks the draft and reuses the existing sales service/repository in
  one serializable transaction. Sale, stock, credit, receipts, draft status/link
  and audits commit together. A rolled-back conversion leaves the draft open.
  Competing conversion/cancellation and lost-response retries cannot post twice.
- Added standalone draft editor/list/detail, split-payment review and linked
  invoice viewing/printing. Read-only and error/recovery states are connected.
  Native Edge recovered a deliberately lost conversion response; one sale at
  59.8500 remained, stock 5.0000 and default CASH/CARD 20.0000/39.8500. A quotation
  was cancelled without financial effects. Finance conversion returned 403.
  Eight captures cover desktop/tablet/mobile and the mobile editor without
  global page overflow. Disposable test data and API were removed.
- Corrected a treasury availability race exposed by the full gate: a timestamp
  cutoff could omit a later-dated competing withdrawal. Transfers and supplier
  payments now check the minimum projected balance over the full movement range.
  Deterministic future-withdrawal/receipt and overlapping transaction regressions
  passed. Historical financial rows are preserved.
- TypeScript and production build passed. Web: 342 tests/31 files; contracts:
  34 tests/18 files, all four metrics 100%. Final API gate/activation are recorded
  after completion. Device evidence: .local/draft-browser-verification.log,
  .local/design-review/2026-11-02/drafts/ and docs/operations/sale-drafts-rollout.md.
- B13/F21 remain partial: expiry policies, quote templates and direct POS cart
  handoff are deferred. Phase 3 78.125%, Phase 4 77.083%, total 67.65625% (68%).
- Final gates: 310 API/62 files, 342 web/31 files, 34 contracts/18 files;
  statements, branches, functions and lines all 100%. TypeScript/build passed.
  New migration and SELECT/INSERT/UPDATE grants were applied to local demo;
  all 36 historical business fingerprints matched and the API restarted.
  Evidence: .local/draft-api-final.log, .local/draft-web-final.log,
  .local/draft-contracts-final.log and .local/draft-deployment-verification.json.


## Strict draft invariants and backup verification — 2026-11-02

- Verified a fresh read-only-by-default backup against all 38 demo tables;
  counts/fingerprints matched. Existing migration checksum matched and no schema
  migration was pending; no redundant migration was applied.
- Added exact financial-row snapshots across save/reopen/edit/cancel for both
  quotation and held drafts. Stock, treasury accounts/movements, customer/supplier
  ledgers, sales, lines and payments stay unchanged before confirmed conversion.
- Corrected bounded retries for raw PostgreSQL SQLSTATE 40001/40P01 surfaced as
  Prisma P2010. Other raw query errors propagate without replay. Concurrent
  conversion and the fresh lost-response browser cycle leave exactly one sale.
- Fresh E2E checks passed on desktop/tablet/mobile, including finance denial,
  cancellation, split payments and linked invoices. Exact balances reconciled;
  disposable test data/API were removed.
- Final API gate: 314 tests/62 files, all four source metrics 100%. Unchanged web
  and contracts gates remain 342/31 and 34/18 with all metrics 100%, totaling 690
  tests. API TypeScript passed. Local API restarted with the retry fix; no demo
  financial test postings were made.
- Evidence: .local/draft-backup-manifest.json, .local/draft-current-readiness.json,
  .local/draft-strict-targeted.log, .local/draft-api-final.log,
  .local/draft-browser-verification.log and .local/draft-demo-read-verification.json.

## 2026-11-02 — Core step 1: purchase orders
- Order creation/cancellation has no stock or financial postings. Partial receipts use one serializable transaction and immutable receipt-to-purchase links; repeated/concurrent receipt keys post exactly once.
- Order-linked purchases cannot be revised through the independent purchase revision flow.
- Verified: 8 API critical tests, 19 UI/navigation tests, API/web typechecks, native Edge desktop/mobile receipt cycle with an intentionally lost response. Browser reconciliation: 2 receipts, 2 purchases, stock 5, supplier credit 50.
- Demo migration `20261102002000_purchase_orders` and scoped grants applied after verified backup `ahmed_store_core_step1_20261102084808`; 37 historical business-table fingerprints unchanged. Full regression discovery was stopped when stalled; no full-suite pass is claimed.

## 2026-11-02 — Core step 2: master management
- Added audited, concurrency-checked edits and archive/restore for products, branches and categories, plus versioned general shop settings. Existing full product editing remains available.
- Archive rejects nonzero stock, open drafts/orders, and categories with active products; historical stock/financial rows remain intact.
- Verified 48 critical API tests, 22 UI tests, both typechecks and isolated native Edge edit/archive/restore/settings persistence checks at desktop/mobile widths.
- Demo management migration applied after verified backup `ahmed_store_core_step2_20261102091731`; 39 historical business-table fingerprints unchanged (new settings metadata excluded).

## 2026-11-02 — Core step 3: user/branch administration
- Added admin role updates, deactivation/reactivation, password reset, selected-branch permissions and session revocation. New non-admin users start without branch grants; existing all-branch access is retained by migration.
- API E2E verified the full core purchase/receipt/held-sale/return/settlement cycle, five-role matrix, concurrent request isolation, cross-branch read/write denial and no-branch users. Exact cash reconciliation is 100 + 20 - 40 = 80, with duplicate settlement requests posting once.
- Final critical evidence: 72 distinct API tests / 10 files (overlapping runs counted once), 49 UI tests / 7 files, 5 contracts tests / 4 files, both typechecks and production build. Native Edge role/branch/reset/deactivate/session workflows passed at desktop/mobile widths after checkbox/accessibility fixes.
- Demo migration `20261102004000_user_branch_administration` applied after verified backup `ahmed_store_core_step3_20261102092948`. Historical fingerprints, grants, scoped branch links and all 30 migration checksums verified; no migrations pending. Seven authenticated read endpoints passed, with no financial demo writes.
- Isolated browser fixtures/accounts were removed and the test API stopped; demo API/web remain running. The three requested core steps are complete. Advanced deferred work, full release coverage, physical printer/owner acceptance and Phase 5/6 gates remain open. Updated planning estimate: Phase 3 87.5%, Phase 4 89.583%, overall 73.75% (74%).
- Rollout evidence: [core delivery](../operations/core-phase-3-4-rollout.md).

## 2026-11-02 — Owner core sign-off and Phase 5 trial
- Explicit owner UI/workflow approval closes Phase 3 and Phase 4 at 100% core scope. Previously postponed advanced work and hardware printer checks are officially post-launch; the scope decision is in `post-launch-deferrals.md`.
- Full regression executed once in disjoint batches after discovery-only stalls: 329 API / 66 files, 355 UI and design / 34 files, 35 contracts / 19 files, plus the legacy business test. No application regression found; no 100% source-coverage claim is made.
- Phase 5 tools/templates support exact, atomic master/opening imports and original-key replay. Seven new migration tests passed after fixing the opening-import audit constraints; all changes were applied only to isolated copies.
- Verified backup fingerprints and 39 copied historical business tables, transaction dry-run rollback, idempotent replay and a 41-table whole-database restore/reapply. Read-only application stock, treasury, statements and report checks passed.
- Demo business/schema data remain unchanged and API/web return 200. The new opening-import migration is not deployed to demo. The retained trial uses synthetic source data; real-data production activation is not performed.
- Phase 5 isolated-trial core is complete. The rebaselined core estimate is 90%; Phase 6 production readiness, real-source approval/freeze/cutover and production operational controls remain. See `../operations/phase-5-migration.md` and `phase-5-trial-verification.json` for evidence.

## 2026-11-02 — Phase 5 owner closure and Phase 6 readiness implementation
- Owner accepted Phase 5 core at 100%; actual legacy cutover is manual using the new CLI. Migration 20261102005000 is now applied to demo after a verified encrypted backup/isolated restore. All 31 checksums match; financial data were preserved.
- Delivered production builds/configuration, HTTPS proxy, environment checks, structured logs, readiness/metrics/monitoring, automated encrypted backup/restore and security/rate controls. Final restore matches 41 tables and schema; runtime grants prevent ledger rewrites.
- Full app/contracts regression: 725 tests; fresh migration 7; restricted-role/backup 8; legacy script, typechecks and builds pass. Local HTTPS desktop/mobile and security smoke pass. Burst performance: 100 concurrent reads, p95 646ms, zero failures.
- Demo remains running. Broader release acceptance is 96.25%; actual container/public-host/alert verification and historical sustained p95 <500ms goal remain open. No public go-live, full-source coverage or real legacy cutover is claimed. See `../operations/production-readiness.md` and `phase-6-verification.json`.

## 2026-11-02 — Local catalogue performance and owner software closure
- Narrow product/session selects and native Prisma tenant-relation batching reduce 100 simultaneous reads from 102 SQL statements to four without an application response cache. Fresh authorization and branch isolation remain enforced; pool is bounded at 10.
- Concurrent index migration 20261102006000 is applied after backup verification. All 32 checksums, 38 business-table fingerprints and final encrypted 41-table restore verify. Optimized demo API is activated; database/web stay running.
- Normal-operation HTTPS p95: 434/286/328ms for three runs of 100 concurrent reads with 100 warmed connections, zero failures. Cold TLS/DNS samples are retained separately and are not claimed below 500ms. Final critical regression: 36 tests plus 8 restricted-role/crypto tests, typechecks and bundle passed.
- Explicit owner scope decision closes all local software deliverables at 100%; host/Docker/domain/remote CI/external alerts and real legacy CLI activation remain operator tasks. See `../operations/catalogue-performance.json`.
