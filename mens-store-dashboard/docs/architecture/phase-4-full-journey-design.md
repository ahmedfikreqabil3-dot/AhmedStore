# Complete interface and journey design — 2026-10-29

The owner requires every interface and journey in the release scope. The nine
existing live screens are only the first design pass. This checkpoint extends
the isolated prototype; it does not mark Phase 4 complete or change live-package
scores. Navy/teal, Cairo typography and RTL remain the agreed direction.

Review entry: `http://localhost:5173/design-preview.html#journeys`.
All added routes use fixed fictional fixtures and make no API calls. Confirmation
buttons complete a local preview and explicitly announce that nothing was saved.

| Release scope | Preview route | Current design checkpoint | Operational dependency / remaining detail |
| --- | --- | --- | --- |
| F01 authentication | `#login` | Existing login design | Password/session failure and access acceptance remain in F20. |
| F02 sale and settlement | `#pos` | Existing POS design/live workflow | Full-cycle acceptance and payment recovery. |
| F03 product lifecycle | `#products`, `#categories` | Catalogue, category editor, archive/restore and replacement-category review | Live product maintenance exists; category/lifecycle bindings and final acceptance remain. |
| F04 stock balances | `#inventory` | Branch/historical stock and low-stock controls | Real stock workspaces are implemented; device/role/owner acceptance remains. |
| F05 purchasing | `#purchases` | Existing purchasing/replacement/return live forms | B16 original-key retries and final cycle acceptance. |
| F06 invoice details/returns | `#invoice-returns` | Original-line quantities, prior returns, revision, split refund and review/back/discard | Complete live invoice read/detail/return bindings and final policy acceptance remain. |
| F07 no-invoice returns | `#sales` plus live `/#returns` | Existing live request/approval UI | Rejection/resubmission, eligibility and broader cycle acceptance. |
| F08 shifts | `#finance` | Existing open/close/review design/live forms | Human final confirmations and discrepancy acceptance. |
| F09 indicators | `#dashboard` | Existing illustrative dashboard | B12 real read models; no prototype KPI counts as live. |
| F10 reports | `#reports` | Seven report layouts with filters, drill-down, export and loading/empty/error/forbidden states | B12 real read models, matching export filters and owner acceptance remain. |
| F11 customers | `#customers` | List/detail, exact statement, create/edit/review and archive/restore safeguards | Live profile editing and statements exist; lifecycle and customer import remain. |
| F12 suppliers | `#suppliers` | List/detail, exact statement, create/edit/review and archive/restore safeguards | Live profile editing/import/statements exist; lifecycle remains. |
| F13 expenses | `#expenses` | List/detail, entry/review and correction preview | Live entry/history/recovery is under verification; correction is separately controlled. |
| F14 treasuries | `#treasuries` | Accounts, statement, lifecycle safeguards and balanced transfer review | B15 real accounts, balance controls and paired transfers remain. |
| F15 branches | `#branches` | List/detail, editor, branch lifecycle and referenced-record block | Live administration and approved access scopes remain. |
| F16 stock operations | `#stock-operations` | Opening/count/adjustment/transfer with discrepancy, balance and distinct-branch validation | All live stock workflows are implemented; final device/role/owner acceptance remains. |
| F17 users | `#users` | Account/role/branch editor, capability summary, reset request and disable safeguards | Live administration, accepted branch grants and secure reset implementation remain. |
| F18 settings/categories | `#settings`, `#categories` | Settings/category management, replacement-category archive, restore and explicit discard | Live settings/lifecycle bindings and permission acceptance remain. |
| F19 consistency | All routes | Shared palette, fields, dialogs and RTL cards | Final owner review across complete scope remains open. |
| F20 acceptance | All routes | Local design checks below | Complete business cycle, all roles, resilience, accessibility and owner acceptance remain open. |
| F21 quotations/held invoices | `#quotations` | Multiline exact draft, held resume/cancel/renewal, price/stock/expiry and duplicate-conversion states | B13 persistence and idempotent authoritative sale conversion remain. |
| F22 purchase orders | `#purchase-orders` | Multiline order draft, exact partial receipt, over-receipt guards, closed/cancelled states and remainder cancellation | B14 persistence, order/receipt links and cancellation rules must be authoritative at posting. |
| F23 printing | `#printing` | A4 and 80mm receipt layouts | Actual document binding, print dialog, pagination and printer validation. |
| F24 settlements | `#settlements` | Customer/supplier allocation editor, invoice ceilings, over-allocation guards and review/discard | Independent settlement posting, treasury accounts and final allocation policy acceptance remain. |

## Reusable journey states

The twelve added record workspaces include search, list/detail, form/review,
cancel, preview success, and explicit empty/loading/error switches. Native field
validation is present; returning from review preserves entered values. Posted
document correction is labelled reversal/replacement rather than direct editing.
Sensitive account-reset previews contain no real credentials. Dedicated draft and stock examples use exact fixed-point calculations; illustrative metrics remain fixtures.

This is a first reviewable design expansion, not final journey acceptance.
Remaining detailed interactions in the last column must be designed and reviewed
before each workspace is declared complete or connected to its backend.

## Verification at this checkpoint

- API: 136 tests / 34 files, 100% statements, branches, functions and lines;
  dedicated PostgreSQL test database only. Product-edit concurrency, tenant/role
  checks, duplicate identifiers, category validity, rollback and historical
  snapshot integrity covered.
- API and preview TypeScript checks passed. Isolated preview build passed.
- All fourteen added destination pages rendered at 1440px and 390px without
  document horizontal overflow. Customer entry → review → back retained typed
  data; mobile invoice detail showed original/returned/returnable quantities.
  Screenshots are saved under `.local/design-review/`.
- Preview-only data is not credited to F06/F09–F18/F21–F24 live implementation.
  Overall release estimate remains approximately 51% under the unchanged scoring.

## Next ordered work

1. B16: preserve original command keys and block duplicate submission across
   purchasing/replacement/returns; verify uncertain-result recovery.
2. Refine complete journey design in the table, starting with customer/supplier
   lifecycle and account statements (4B), then administration and stock/finance.
3. Review each design with the owner, then implement verified backend contracts
   and connect the relevant interface. Continue documents, reports and printing.
4. Whole-cycle/role/mobile/accessibility acceptance, migration rehearsal and
   production readiness remain independent exit gates.

## Management journey refinement — 2026-10-30

This checkpoint extends the design, without connecting operational APIs or
changing the 51% release estimate. It supersedes the earlier design-gap notes
for the specific interactions below; backend lifecycle and policy work remain.

- Customer/supplier/account management: local archive/restore preview, reason
  and review step, active/archived filter and an archived-empty recovery action.
  Accounts with obligations, funded treasuries and occupied branches demonstrate
  the blocked path. These are explicit fixture scenarios, not authoritative
  eligibility rules or actual balance checks.
- Category archive: choose a replacement category before review. The prototype
  does not move product records; actual reassignment policy remains to be approved.
- User administration: proposed role and multiple branch selection, no-empty-scope
  feedback, current-user stop protection, and reset-request review without
  displaying/creating credentials or sending messages. The final permission
  matrix and session revocation policy still require agreement.
- Customer/supplier/treasury statements: period inputs, invalid-range feedback,
  opening/closing balance layout, movement document detail, export preview and
  a no-movements scenario. Values remain fixed examples, explicitly labelled;
  filtering does not query or calculate live account data.
- Shared forms: cancel and Escape require an explicit discard decision after
  edits; continuing preserves fields. Review/back preserves entered values.

Implementation is isolated in `LifecycleJourney.tsx`, `AccountStatement.tsx` and
the design workspaces. Dedicated jsdom interaction checks use
`apps/web/vitest.design.config.ts`; operational coverage thresholds are unchanged.

Browser automation did not respond during this checkpoint. New visual, keyboard
and mobile acceptance therefore remain pending; the previous 1440px/390px checks
above apply to the earlier prototype version. Passing component checks and a
build must not be presented as a completed new browser review.

The same checkpoint also adds `DocumentJourney.tsx`: two-line partial-receipt
entry, ordered/previously received/remaining quantities, integer/over-receipt
feedback, reason/reference and review/back/discard; invoice-return entry with
sold/previously returned/returnable quantities and refund method/condition;
prior-return reference and reversal/replacement review. These are local fixture
interactions, not inventory or financial posting. Backend eligibility, refund
allocation and stock/disposition policy remain authoritative and unresolved
design details must not be inferred from example quantities.

Verification: eleven dedicated interaction tests passed, with a fetch spy proving
that the tested journeys made no API calls. Preview TypeScript and production
build passed; `git diff --check` passed. Operational API/web coverage suites were
not rerun for this prototype-only checkpoint; earlier counts remain historical.

Next design slice: held-document continuation/cancellation/expiry, detailed split
refund review, report state/drill-down and final print review. Complete new
browser/mobile/keyboard review when browser control is available. B16 operational
retry resilience is still open separately.

## Held documents, refund review, reports and printing — 2026-10-30

The next design slice above is now implemented as a review candidate, with the
following boundaries. New browser acceptance remains pending: browser control
timed out again; the local preview itself returned HTTP 200.

- `HeldDocumentJourney.tsx` covers continuation and cancellation, required reason,
  expiry/renewal, changed-price acknowledgement, insufficient stock, cancelled
  state and previous conversion. Blocked scenarios disable continuation; previous
  conversion also blocks cancellation. No actual sale is created or transferred.
- POS now has a named held-draft review that preserves the current cart within
  that view. Its confirmation is preview-only, without durable draft storage.
  Sales invoice details open the line-return journey instead of a placeholder
  notification. Settings link to users, branches and category workspaces.
- `RefundAllocation.tsx` demonstrates cash/card/account allocation against a fixed
  690.00 example, with exact minor-unit validation, original cash/card ceilings,
  sum validation and review/back. This example is explicitly independent of the
  quantities selected. It must not be reused as the real refund calculation or
  treated as approval of account-credit conversion rules.
- `ReportResults.tsx` covers loading, error/retry, no results, insufficient scope
  and row detail. The report workspace validates the date range and disables
  export outside its sample-data state. Filter selection remains illustrative;
  there is no operational querying or file export.
- `PrintWorkspace.tsx` covers sale, sale-return, purchase and quotation layouts,
  A4/80mm, copy validation, settings review and a simulated preparation error.
  No print API or real printer connection is invoked. Physical pagination,
  printer margins and browser print behavior still need verification.

Quality evidence is in `ManagementJourneys.test.tsx` and
`CompletionJourneys.test.tsx`. Browser visual/mobile/keyboard review, final owner
acceptance, the outstanding role/stock/refund policy details in the scope table,
and all operational API bindings are still open. Thus this checkpoint does not
declare complete interface acceptance or raise the live release estimate.

Final verification for this checkpoint: 21 design interaction tests in 2 files passed; preview TypeScript and build passed. API access and real printing were guarded by test spies. No operational coverage claim is inferred from these prototype tests.

## Stock, treasury and settlement review candidates — 2026-10-30

`OperationJourneys.tsx` adds opening, increase/decrease adjustment, a two-item
physical count with exact four-decimal discrepancy, paired branch transfer,
treasury-account transfer and customer/supplier allocation review. It validates
different source/destination, positive quantities, available fixture balances,
individual invoice ceilings and allocation totals. Modified forms require an
explicit discard decision. The role editor also shows capabilities matching the
existing API role map; choosing a role does not create new grants.

These journeys use fixed examples. They are not operational count sheets,
treasury accounts or settlements. The latest combined web gate includes 24
dedicated design interaction tests. Browser visual, keyboard, responsive and
physical print acceptance remains open because browser control is unavailable.
The owner has been asked whether an alternative local Playwright browser may
be used; no authorization has yet been received.

Operational work now includes real customer/supplier profile editing and paired
stock transfers, plus an opening/adjustment interface under current verification.
Statements, lifecycle controls, count-sheet posting and financial account flows
must still be bound to authoritative APIs before their packages are complete.

## Document editor and purchase journey detail — 2026-10-30

`DraftDocumentJourney.tsx` replaces the one-product quotation/held/order draft
form with add/remove lines, duplicate checks, exact four-decimal quantity/price/
discount preview, dates, party/branch, notes, review/back and explicit discard.
It preserves the rule that an order or quotation does not post stock or money.

`PurchaseJourney.tsx` replaces purchase-detail placeholder notifications with
original line/payment detail, entry, return and reversal/replacement review.
Return quantities include previous returns. A prior return disables purchase
replacement; voided purchases disable posting actions. Settlement components
must add to the illustrated document total. Supplier credit/refund and changed
stock eligibility are still subject to authoritative posting checks.

Thirty-four design interaction tests passed in two files, with API/print spies.
Latest production builds of live and isolated preview succeeded before this
purchase-detail slice; the updated builds and TypeScript are being rerun.
The live physical-count interface is also implemented separately from fixtures,
with stock-snapshot concurrency and audit tests. This does not close browser
visual/keyboard/physical-printer or owner acceptance.
## Current completion checks — 2026-10-30

38 isolated prototype interaction tests now pass. Order design includes explicit
cancellation of the unreceived remainder, preservation of prior receipts,
completed/cancelled receiving blocks and four-decimal partial quantities.
Native browser checks cover cancellation and receipt review at 1440/390 pixels.
Live expense review passed at both widths without posting a payment. Customer/
supplier profile, statement and lifecycle bindings are tracked separately from
the prototype in the execution ledger; prototype-only order actions still do
not complete F22. The matrix above is updated to distinguish designed journeys
from their remaining authoritative backend/acceptance dependencies.
