# Phase 4A — UI/UX refinement

Owner approval: 2026-10-29. Review basis: UI UX Pro Max local quick reference
(accessibility, interaction, forms, typography). Applies to preview and live UI.

Keep: navy #172B4D, teal #0F766E, mint #E6F4F1, background #F6F8FB, Cairo.

## Agreed findings

| Finding | Planned response | State |
| --- | --- | --- |
| Some 10–11px helper text had roughly 3.1–3.5:1 contrast on white. | Shared readable type scale and darker secondary text; preserve brand palette. | First slice implemented: key helpers 12px, data 13–14px; secondary #52637A measures 6.13:1 on white. Full control/status-color audit remains. |
| Branch identity is easy to miss. | Selected branch near checkout, payment review, and branch-stock table. | Implemented in live checkout/review and preview checkout/product/inventory context. Recovered commands retain the original branch even when unavailable in current options. |
| Generic new-sale shortcut appears on unrelated preview pages. | Keep contextual actions; remove unrelated shortcut. | Implemented; product/purchase pages retain their own actions. |
| Dense table details and amounts. | Increase row spacing, tabular numerals, readable captions and currency context. | Shared spacing/type changes implemented; preview product price header explicitly identifies EGP. |
| Sale error is distant from correction controls. | Move existing error to checkout; keep feedback in payment dialog. | Implemented for live sale checkout. Field-specific treatment across other forms remains. |

## Verification — 2026-10-29

- Web: 91 tests passed; 100% statements, branches, functions, and lines.
- TypeScript: live and design-preview projects passed.
- Desktop 1440px and mobile 375px: inspected preview sale/product screens;
  no whole-page horizontal overflow. Wide sale tables scroll in their region.
- Preview payment dialog at 375px shows the branch and return action without
  submitting a sale. No browser financial confirmation was performed.
- Tab from product search reaches the category filter with a visible 3px outline.
- Screenshots saved locally under `.local/design-review/phase-4a-*`:
  product desktop, POS desktop/mobile, payment mobile.

## Live products refinement — owner-requested follow-up

- Replaced the stacked catalogue icon/heading with one aligned title group;
  tightened header, filter, and table spacing in the actual application.
- Live product prices display two decimal places through exact fixed-point
  rounding. Editor values and save payloads retain the original four-decimal
  precision. A regression test covers 19.9550 displayed as 19.96 and saved unchanged.
- Added a labeled keyboard-focusable table scroll region and explicit filter labels.
- Improved the product editor: full-width product name/category, paired prices,
  clear pricing guidance, first-input focus, and readable mobile controls.
- Verified actual admin catalogue search by SKU and branch-stock loading against
  the running API. The sale-test item showed 1.0000 in its test branch at review.
- Inspected the live product page at 1440px/375px and the mobile editor; wide tables
  stay within their scroll region. No product or financial data was saved in the
  browser during this design review.
- Evidence: `.local/design-review/products-live-desktop.png`,
  `products-live-mobile.png`, and `products-editor-mobile.png`.
- Final frontend verification: 92 tests passed with 100% lines, functions,
  branches, and statements. Earlier transient wait-time failures passed on an
  isolated rerun without changing timeouts or coverage thresholds.

## Live inventory screen

- Added a branch/time context region with explicit current vs historical scope.
  Historical balances are requested at local end of the selected day; server
  immutable inventory movements remain authoritative.
- Removed sale-price columns from the inventory view. The status column is
  explicitly product activity, not a claim that a positive stock balance exists.
- Quantity display trims only redundant decimal zeros; signed and fractional
  quantities retain all significant digits. Product tables share this formatting.
- Verified actual branch selection and keyboard date editing in the running app.
  The sale-test item showed 3 at the end of 2026-10-28 and 1 at current review.
  These are local demo observations, not hard-coded dashboard metrics.
- Full web suite: 95 tests passed at 100% statements, branches, functions and lines;
  TypeScript and production build passed. The strengthened old-branch response
  regression was then rerun in the 10-test catalogue file, all passing.
- Desktop 1440px / mobile 375px inspected. At mobile width, the 580px table is
  contained in a 298px scroll region; the page itself does not overflow.
- Owner review remains open; next design slice is purchasing.

## Remaining work before phase acceptance

- The remaining live-screen design work was completed in the final pass on
  2026-10-29: see [screen acceptance](phase-4a-screen-acceptance.md). All nine
  existing screens were inspected at desktop/mobile sizes, with populated
  secondary forms additionally reviewed in an isolated harness.
- Owner visual acceptance remains pending. These checks are not an exhaustive
  WCAG certification or a production-readiness assessment.
- Complete product-edit API verification separately; this visual slice does not
  establish backend update readiness or complete Phase 3.
- New dashboards/reports, customer management, settings management, and any other
  features absent from the live app remain separate Phase 4 feature work.
