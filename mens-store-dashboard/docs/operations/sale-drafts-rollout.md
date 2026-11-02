# Sale drafts rollout — activated and verified

Core implementation: quotations and held invoices with versioned edits,
cancellation and atomic sale conversion. Drafts do not reserve stock or post
money. Conversion reuses the existing sale checks, stock/credit/treasury posting
and audit inside the same serializable transaction. A private conversion key
and one-to-one sale link make lost-response retries safe.

Migration 20261102001000_sale_drafts and SELECT/INSERT/UPDATE grants on SaleDraft
were applied to the local demo on 2026-11-02. All 36 historical business table
fingerprints matched. The local API restarted with the treasury safety fix.
Deployment evidence: .local/draft-deployment-verification.json.

## Local activation

- Migration: `20261102001000_sale_drafts` creates only `SaleDraft`, its scoped
  foreign keys, uniqueness/check constraints and indexes.
- Application role needs `SELECT, INSERT, UPDATE` on `SaleDraft`; no delete or
  unrelated new permissions are required.
- Stop only the local API during deployment. The guarded device helper
  `.local/deploy-sale-drafts.mjs` allows only this pending migration and the
  exact local demo database, fingerprints all historical business tables before
  and after, verifies the application grants and performs an actual scoped read.
- Restart through `Start-Local.ps1` and verify authenticated draft-list reads.
  Do not post test financial documents to the demo database.

## Evidence

New API/UI coverage gates passed at 100%. The isolated browser test saved and
reopened a held invoice, edited it, lost the first successful conversion
response and retried the original command. Exactly one sale remained: total
59.8500, stock 5.0000, default CASH 20.0000 and CARD 39.8500. A separate quotation
was cancelled without stock or balance effects. Finance conversion returned 403.
Desktop/tablet/mobile views and the mobile editor had no global page overflow.
Device evidence is under `.local/design-review/2026-11-02/drafts/` and
`.local/draft-browser-verification.log`. Full gates: 314 API, 342 web and 34 contract tests; all four source coverage
metrics 100%. API/web TypeScript and the production web build passed.

## Rollback

Disable the new route/UI in application code and retain the draft table,
conversion links and financial sale documents. Do not drop converted drafts or
reverse a sale by deleting data. Use the established current-date correction
workflows for financial corrections. Expiry policies and moving the active POS
cart into/out of a held draft remain deferred.

## Financial concurrency correction

Treasury transfer and supplier-payment availability checks now use the lowest
balance from the posting timestamp onward, including later-dated movements.
The full account movement range participates in the serializable read, so
transaction order or a retained request timestamp cannot hide a competing
withdrawal. Displayed as-of balances keep their existing semantics. Regression
coverage includes overlapping withdrawals, future withdrawals and unavailable
future receipts. No historical financial rows are rewritten.


## Owner-approved verification checkpoint — 2026-11-02

The owner explicitly authorized necessary local schema migrations after backup
verification. This checkpoint required no new migration: the existing draft
migration checksum matched and no migrations were pending.

A fresh backup, `ahmed_store_drafts_verified_20261102074828`, was independently
read and verified against all 38 source tables, including SaleDraft and the
migration registry. Table counts and full-table fingerprints matched, and the
backup session reported transaction_read_only=on. The older treasury backup was
preserved. Evidence: .local/draft-backup-manifest.json and
.local/draft-current-readiness.json.

The critical draft test now compares all stock movements, treasury accounts and
movements, customer/supplier ledgers, sales, lines and payments before and after
save/reopen/edit/cancel for both draft kinds, including proposed quantities above
available stock. Only explicit conversion may create financial effects. Existing
concurrent conversion, audit rollback and lost-response E2E checks remain in place.


Raw PostgreSQL transaction conflicts surfaced through Prisma P2010 are now
retried only for SQLSTATE 40001/40P01, with the same bounded fresh-transaction
policy as P2034/P2002. Other raw SQL errors propagate without replay. The direct
concurrent-conversion test and lost-response browser cycle verify a single sale
and one set of stock/financial postings. Critical focused tests passed at 100%
source coverage; final full-gate results are recorded in the execution ledger.
