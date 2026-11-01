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
