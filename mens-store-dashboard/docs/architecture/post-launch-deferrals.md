# Post-launch deferrals — 2026-11-03

All requested software deferrals are delivered and verified. The sole remaining
item in this register is **physical hardware-printer testing**, owned by the
operator. Browser print layouts are verified; no physical print job is claimed.

Delivered software:

- Treasury account rename, versioned default reassignment, zero-balance archival
  and restore; explicit account choices in sales, drafts, expenses, purchases,
  purchase returns, invoice refunds and Finance-approved no-invoice refunds.
  Corrections reverse the original ledger account even after a default change.
- Quotations expire 30 UTC days after creation. Expired quotations cannot be
  edited or converted, but can be cancelled. Held invoices do not expire.
  POS handoff preserves the current cart; conversion retains the original
  idempotency identity. Saving or printing a draft never posts stock or money.
- Escaped quotation, purchase-receipt and customer/supplier-settlement templates;
  public header/footer/contact settings shared with A4 and 80mm sales layouts.
  Partial settlement receipts show the unallocated amount explicitly.
- Daily net-sales and operating-cashflow SVG charts, exact accessible tables,
  current exception counts and shared screen/export report filters. Periods are
  UTC and limited to 366 days. Cashflow excludes openings and internal transfers;
  product/payment filters select whole matching documents.
- Full-source coverage collection and expanded integrity/RBAC tests: 759 automated
  tests pass, plus legacy business tests. API line/branch coverage is
  99.56%/98.91%; UI line/branch coverage is 100%/97.90%. These are measured
  percentages, not a claim of 100% coverage in every source metric.

Evidence: [software verification](../operations/post-launch-software-verification.json).
A fresh encrypted backup restored with matching 41-table fingerprints; all 38
Demo business-table fingerprints and 32 migration checksums remain unchanged.
No schema migration was required. Demo API and web remain running.

External host/container/domain activation and real legacy-data cutover remain
operator deployment responsibilities under the existing handover; they are not
unfinished software features in this register.
