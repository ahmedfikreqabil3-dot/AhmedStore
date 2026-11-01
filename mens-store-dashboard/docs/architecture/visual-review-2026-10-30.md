# Local visual review — 2026-10-30

The owner authorized a local Playwright browser after the integrated browser
failed to respond. This review uses headless Microsoft Edge with isolated browser
contexts. Screenshots and raw measurements are stored under the ignored local
directory `.local/design-review/2026-10-30/`.

## Prototype layout sweep

24 rendered destinations were opened at widths 1440, 768 and 390 pixels: 72
captures. Every capture had a document width equal to its viewport, no uncaught
JavaScript errors, and loaded Cairo font faces. API and external network access
were blocked; the prototype attempted neither. Wide tables use named, focusable
scrolling regions instead of widening the page.

Manual screenshot inspection includes the journey map, mobile point of sale,
reports, stock operations and print layout. Their cards, fields and hierarchy
remain readable in the mobile layout. This sample inspection is not a claim
that every screenshot or every possible data state has received manual review.

## Native browser interaction evidence

On desktop and mobile, the skip link preserves the current route and focuses the
workspace. The quotation editor preserves its exact quantity on review/back;
Escape on a modified draft asks for explicit discard; continuing preserves the
draft; discarding closes it. Native modal tab traversal did not focus an outside
page control. A browser toolbar cycle can report BODY as the active element and
is not an outside page-control escape.

The review found that unmounting a draft dialog left focus on BODY after closing.
The shared `usePreviewDialog` hook now closes the native dialog on cleanup and
restores its opener, falling back to the workspace when that opener is removed.
Playwright confirmed return to the opening button at both widths. The hook is
used by the prototype's shared dialog and specialized draft, purchase, return,
stock, lifecycle, held-document and print dialogs. The existing 34 prototype
interaction tests pass after this change.

## Remaining acceptance

Eleven live destinations were inspected at the same three widths (33 captures).
All had viewport-matching document widths, no uncaught JavaScript errors, no
failed operational read responses, and no blocked write attempts. Login and
logout were the only allowed POST actions. The mobile inventory screenshot was
also inspected manually. No financial document was confirmed by this review.
Passing prototype checks does not prove API binding or complete a Phase 3/4 work package.
Financial confirmation, physical-printer output, the full role/branch matrix and
the owner's final design review remain separate acceptance gates.

The new live customer and supplier account statements also passed four isolated
browser checks (two kinds at 1440/390 pixels): exact-period results loaded,
document width matched viewport width, no alert/uncaught error occurred, and
closing restored the opening button. No operational write was attempted. The
mobile customer statement capture was inspected manually. A full-page screenshot
taken after scrolling can show off-viewport fixed elements in the capture;
viewport screenshots or resetting the scroll position should be used to judge
such fixed elements, rather than treating that capture artifact as page content.
