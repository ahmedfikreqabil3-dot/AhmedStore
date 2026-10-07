# Preserved-feature enhancement requirements

These requirements are additional scope. Existing workflows stay available until
their new React/API equivalent passes regression, reconciliation, and acceptance
testing. No legacy screen is removed merely because a replacement is scaffolded.

| ID | Requirement | Planned phase | Acceptance criteria |
| --- | --- | --- | --- |
| ENH-01 | Close the payment window after a confirmed successful invoice. | Phase 4 POS | Window closes only after the API returns a committed sale; it remains open on validation/network/posting failure. |
| ENH-02 | Correct shift-closing totals. | Phase 3 finance | Totals derive from posted sale/return/expense/treasury movements within the shift boundary and payment method, not mutable UI arrays. |
| ENH-03 | Manage product categories/groups and show Settings-created categories. | Phase 3 catalogue + Phase 4 UI | Categories are organization-scoped, archived safely, selectable in product/POS/import screens, and protected from deleting referenced groups. |
| ENH-04 | Add a product table with details and barcodes. | Phase 4 catalogue | Sort/filter/paginate; show SKU, barcode, category, price, stock, warehouse availability, and print/export actions. |
| ENH-05 | Filter inventory by branch, warehouse, and historical date. | Phase 3 inventory + Phase 4 UI | Queries reconstruct stock as-of the requested date from immutable ledger movements and enforce warehouse scope. |
| ENH-06 | Do not auto-open prior invoice details in Sales History. | Phase 4 sales | Details open only through explicit user action; navigation/reset tests verify no stale selection. |
| ENH-07 | Export Sales History into separate rows/columns. | Phase 4 reporting | CSV/XLSX contains one documented row grain, explicit columns, locale-safe decimals/dates, selected filters, and permission/audit checks. |
| ENH-08 | Edit saved sales returns with correct stock/financial adjustment. | Phase 3 returns | Edit is implemented as an audited reversal and replacement posting, never mutation of a posted return. |
| ENH-09 | Prevent cumulative returns beyond quantity sold. | Phase 3 returns | PostgreSQL transaction rejects quantity above original line quantity minus completed returns, including concurrent requests. |
| ENH-10 | Support return without original invoice. | Phase 3 returns | Allowed only to approved finance roles; requires reason, customer/warehouse, item condition/value, refund method, approval/audit trail, and treasury movement. Exact refund valuation requires business approval before implementation. |
| ENH-11 | Barcode entry/scanning for purchase invoices. | Phase 4 purchases | Keyboard/scanner input resolves an organization product barcode, adds/increments the line, and rejects unknown/duplicate conflicts clearly. |
| ENH-12 | Edit saved purchase invoices with stock/financial controls. | Phase 3 purchasing | Edit creates compensating inventory/payable/treasury postings and replacement posting; closed periods require elevated permission. |
| ENH-13 | Support purchase returns. | Phase 3 purchasing | References received purchase lines, restores supplier balance, removes available stock only if sufficient, and posts atomically. |
| ENH-14 | Excel import/export on applicable pages. | Phase 4 shared import/export | Template download, preview, row validation, authorization, audit log, dry run, transaction/partial-error policy, and error workbook download. |

## Required decisions before posting behavior is implemented

1. **No-invoice return valuation:** recommended: current approved selling price
   or manager-entered value with mandatory reason and finance approval. The
   business owner must select the policy before ENH-10 is released.
2. **Posted document editing:** recommended: show “Edit”, but technically post
   a compensating reversal plus a replacement document to preserve auditability.
3. **Export row grain:** recommended: one row per sale line for detailed export,
   with a separate invoice-summary export. This avoids cells containing arrays.
4. **Excel import failure policy:** recommended: validate all rows first, then
   import atomically; no partial business posting on a malformed workbook.
