# Phase 4A — Existing live screens: design review

Date: 2026-10-29. Owner instruction: continue until every existing screen has
the approved design. Implementation complete; final owner visual review pending.

## Scope and evidence

| Screen | Delivered design | Review |
| --- | --- | --- |
| Login | Cairo typography, readable labels/inputs, organization guidance, loading and error presentation. | Actual app at 1440px/375px; login success/failure covered by tests. |
| Overview | Welcome area and role-aware task cards; responsive navigation and page descriptions. | Actual app at both widths; no fabricated KPIs. |
| POS | Branch context, review dialog, readable controls, exact settlement display, checkout errors. | Actual empty draft at both widths; posting/recovery/error paths covered by component tests. |
| Products | Compact header, search/category/branch controls, two-place display prices, readable table and editor. | Actual catalogue and editor at desktop/mobile; original decimal precision retained on save. |
| Inventory/branches | Explicit branch/time context, historical date, quantity formatting, contained table scrolling. | Actual current/historical stock at both widths; obsolete-response regression tested. |
| Sales history | Date filter layout, invoice ID/customer/value table, explicit details, summary and total, pagination/export controls. | Actual posted records and details at desktop; mobile layout inspected. Export explicitly identifies its existing full-history scope. |
| Purchases | Supplier/branch grouping, scan section, line entry, lines/payments lists, totals and primary save action. | Actual options/empty history at both widths; entry errors linked to relevant controls. |
| Finance/shifts | Styled open/close states, review list, ledger summary and payment-method rows. | Actual empty states at both widths; populated close/review forms inspected with isolated fixtures. |
| Returns/approvals | Grouped request inputs, explicit approval wording, readable queue/actions and error messages. | Actual request/empty queue at both widths; populated approval row inspected with isolated fixtures. |

Secondary purchase revision and purchase-return forms use the same components
and design language. Their populated states were additionally inspected at
1440px and 375px using temporary, clearly labeled fixture pages. Every posting
callback in that harness rejected without calling the API. The temporary page
and source were removed after review.

## Design rules applied

- Preserve navy #172B4D, teal #0F766E, mint accents and the Cairo family.
- Use consistent panel headings, spacing, labeled controls, empty states,
  keyboard focus and touch-sized actions.
- Highlight totals and each form's main action; keep helper copy readable.
- Format monetary display with exact fixed-point rounding, including negative
  amounts and values beyond safe floating-point precision. Commands retain their
  original decimal strings. Translate known states/payment methods to Arabic.
- Distinguish product activity from stock availability. Never replace an
  unavailable stock reading with zero or invent metrics.
- Financial transport errors direct users to inspect the relevant record before
  retrying; they do not falsely guarantee that nothing was saved.
- Purchase-entry errors expose `aria-invalid` and their corresponding error text.
  New and replacement purchase forms have distinct heading IDs.

## Verification

- 99 web tests passed; 100% statements, branches, functions and lines, with the
  existing coverage thresholds unchanged.
- TypeScript live and preview checks passed. Production build passed.
- All eight authenticated pages plus login inspected at 1440px and 375px;
  document width did not exceed viewport width. Wide tables scroll inside
  labeled, keyboard-focusable regions. No duplicate IDs in the inspected pages.
- Populated secondary forms also had no page-level overflow at both widths.
- No browser financial save, approval, return, or shift-close was performed.
- Local screenshots: `.local/design-review/{home,pos,products,inventory,sales,
  purchases,finance,returns,login}-final-{desktop,mobile}.png`.
  Secondary fixture evidence: `qa-{purchase-revision,purchase-return,shift-close,
  shift-summary,return-approval}-{desktop,mobile}.png` in the same folder.

## Boundary and remaining project work

This completes the design pass for the existing live screens. It does not mark
Phase 3/4 feature parity, data migration or production deployment complete.
Customer/settings management screens and dashboard/reporting features that are
not implemented remain in the broader delivery plan. Product-edit API readiness
and financial end-to-end reconciliation remain separately tracked work.

Final owner visual acceptance is the remaining Phase 4A acceptance step.

The full remaining project scope, including legacy quotations/held invoices,
purchase orders, printing and settlements, is enumerated in
[the reconciled delivery audit](delivery-audit-2026-10-29.md) and its scored ledger.
The 99-test result above is frontend evidence; it does not describe the current
API gate, which the audit reran and found below the required coverage threshold.

## Subsequent remediation — 2026-10-29

The product-update coverage regression is resolved: 136 API tests in 34 files
pass with 100% statements, branches, functions and lines on the isolated test
database. Earlier failure figures above describe the audit snapshot. Broader
functional gaps and acceptance requirements remain. The expanded interface
prototype is tracked in [full journey design](phase-4-full-journey-design.md).
