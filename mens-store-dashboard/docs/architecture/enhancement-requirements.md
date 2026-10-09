# Preserved-feature enhancement requirements

These requirements are additional scope. Existing workflows stay available until
their new React/API equivalent passes regression, reconciliation, and acceptance
testing. No legacy screen is removed merely because a replacement is scaffolded.

| ID | Requirement | Planned phase | Acceptance criteria |
| --- | --- | --- | --- |
| ENH-01 | Close the payment window after a confirmed successful invoice. | Phase 4 POS | **Implemented component behavior:** the payment dialog closes only after its sale-posting command resolves and stays open with an accessible error on failure. Wiring the React shell to the authenticated sales API is the remaining integration step. |
| ENH-02 | Correct shift-closing totals. | Phase 3 finance | Totals derive from posted sale/return/expense/treasury movements within the shift boundary and payment method, not mutable UI arrays. **In progress:** posted sales, returns, and immutable expenses generate treasury entries; cashiers can open and close one personal shift with expected cash, counted cash, variance, and a mandatory variance reason; Finance/Admin review closed shifts with ledger-derived totals. The React workflow remains. |
| ENH-03 | Manage product categories/groups and show Settings-created categories. | Phase 3 catalogue + Phase 4 UI | Categories are organization-scoped, archived safely, selectable in product/POS/import screens, and protected from deleting referenced groups. |
| ENH-04 | Add a product table with details and barcodes. | Phase 4 catalogue | **Implemented component behavior:** searchable, category-filtered, paginated table showing SKU, barcode, category, sale price, stock, and warehouse. API data loading plus print/export actions remain frontend integration work. |
| ENH-05 | Filter inventory by branch, warehouse, and historical date. | Phase 3 inventory + Phase 4 UI | **Decision 2026-10-09:** each warehouse is a branch. **Implemented backend:** product stock is reconstructed from immutable movements at a requested historical date and can be scoped using either `warehouseId` or the equivalent `branchId` alias. Supplying conflicting values is rejected. The filter UI remains a frontend integration item. |
| ENH-06 | Do not auto-open prior invoice details in Sales History. | Phase 4 sales | **Implemented:** details open only through an explicit action and a selected invoice is cleared when refreshed history no longer contains it. The React screen loads the authenticated, bounded, organization-scoped sales-history API and gives a clear sign-in/retry error on failure. Filtering controls and page navigation remain frontend work. |
| ENH-07 | Export Sales History into separate rows/columns. | Phase 4 reporting | **Implemented:** reporting users can export one row per sale line with explicit columns, date/warehouse/customer filters, and an audit entry, as UTF-8 CSV or a native `.xlsx` workbook with typed dates/numbers and formatted headers. Sales History includes a guarded browser Excel-download control with clear error handling. |
| ENH-08 | Edit saved sales returns with correct stock/financial adjustment. | Phase 3 returns | Edit is implemented as an audited reversal and replacement posting, never mutation of a posted return. **Implemented:** the original return is voided, compensating stock/treasury movements are posted, and a linked replacement is created atomically. |
| ENH-09 | Prevent cumulative returns beyond quantity sold. | Phase 3 returns | PostgreSQL transaction rejects quantity above original line quantity minus completed returns, including concurrent requests. |
| ENH-10 | Support return without original invoice. | Phase 3 returns | Allowed only to approved finance roles; requires a manager-entered refund value, mandatory reason, customer/warehouse, item condition, refund method, finance approval/audit trail, and treasury movement. **Implemented backend:** Manager/Admin submission, Finance/Admin queue and approval, inventory restoration, treasury posting, and audit event. React workflow remains Phase 4. |
| ENH-11 | Barcode entry/scanning for purchase invoices. | Phase 4 purchases | **Implemented component behavior:** keyboard/scanner Enter input resolves a supplied product barcode, adds the matching product, clears the field, and presents a clear unknown-barcode error. Connecting product lookup and the purchase-line state to the API remains frontend integration work. |
| ENH-12 | Edit saved purchase invoices with stock/financial controls. | Phase 3 purchasing | **Implemented backend:** revision keeps the original invoice immutable, voids it, posts compensating inventory/payable/treasury entries, and creates a linked replacement in one serializable transaction. Revisions are blocked after a posted purchase return and when stock is no longer available to reverse. Closed-period authorization remains a future accounting-controls item. |
| ENH-13 | Support purchase returns. | Phase 3 purchasing | References received purchase lines, removes available stock only if sufficient, and posts atomically. **Implemented backend:** the return accepts one or more supplier-credit and/or treasury-refund allocations, verifies their exact total against the calculated return, persists each allocation, and posts inventory, supplier/treasury, and audit entries in one serializable transaction. |
| ENH-14 | Excel import/export on applicable pages. | Phase 4 shared import/export | **Started:** sales-history export has a native permission-checked, audited `.xlsx` workbook. Import templates, preview, row validation, dry run, transaction/partial-error policy, and exports for other applicable pages remain. |

## Required decisions before posting behavior is implemented

1. **No-invoice return valuation:** **decided 2026-10-08** — manager-entered
   value with mandatory reason and finance approval. **Decided 2026-10-08:**
   `FINANCE` is the approver role; `ADMIN` has an approval override.
2. **Posted document editing:** recommended: show “Edit”, but technically post
   a compensating reversal plus a replacement document to preserve auditability.
3. **Export row grain:** recommended: one row per sale line for detailed export,
   with a separate invoice-summary export. This avoids cells containing arrays.
4. **Excel import failure policy:** recommended: validate all rows first, then
   import atomically; no partial business posting on a malformed workbook.
