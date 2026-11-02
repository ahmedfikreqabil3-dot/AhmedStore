# Treasury rollout — applied and verified

The owner explicitly approved both migrations and the SELECT/INSERT grants on 2026-11-01. Both migrations were applied to ahmed_store_demo, the four new table grants were verified using the application role, and all 32 historical business tables matched the verified backup (the migration registry was intentionally excluded). Every treasury account link matched its organization and payment method. The local API restarted successfully and an authenticated read returned the four default accounts.

Evidence: `.local/treasury-deployment-verification.json`. The earlier automatic approval rejection is resolved by the explicit owner authorization. No further approval is needed for this completed rollout.

## Reviewable change

- Create treasury accounts with exact opening balances; preserve historical postings in default accounts by payment method.
- Post paired transfers, customer collections and supplier payments atomically, with original-command recovery and optional invoice allocations.
- Read account balances, paginated running ledgers and party/invoice balances. New movements feed reports and shift reconciliation.
- Account renaming, archival/default reassignment and account selection in older sale/expense forms remain later work. Existing forms use the corresponding default account.

## Validation

295 API, 283 web and 32 contract tests passed with all configured source coverage metrics at 100%. The frontend build and TypeScript checks passed. A real browser financial cycle was reconciled in the isolated test database and reviewed at 1440px, 768px and 390px. Disposable fixtures and the test API were removed.

## Verified backup

- Local PostgreSQL: `127.0.0.1:55432`.
- Source: `ahmed_store_demo`.
- Backup: `ahmed_store_before_treasury_20261101153316`, read-only by default.
- All 33 public tables match the source by row count and whole-table fingerprint.
- Device evidence: `.local/treasury-backup-manifest.json`.
- Pre-treasury Prisma schema: `.local/treasury-before.prisma`.

The backup is a separate local database, not an exported file. Keep the local PostgreSQL data directory intact.

## Completed approval scope and rollout

1. Keep the demo API stopped during the update and verification.
2. Apply `20261101009000_treasury_transaction_types` and `20261101010000_treasury_accounts_and_settlements` to `ahmed_store_demo`.
3. Grant the application role only `SELECT, INSERT` on the four new treasury/settlement tables. Existing unrelated grants stay as configured.
4. Verify that historical treasury row counts and fingerprints match the backup when the new `accountId` metadata is excluded; verify every account link matches organization and payment method.
5. Start the current application and confirm authenticated reads before allowing new business postings.

The migration adds account metadata to historical entries; it does not change their amounts, actors, sources or timestamps, or invent opening cash.

## Rollback before reopening business writes

- A failure inside the main migration transaction rolls back its table changes. Added enum labels may remain; do not attempt to remove them manually.
- If post-migration checks fail, keep the API stopped and preserve the failed target for diagnosis. Clone the verified backup into a new recovery database; do not overwrite or delete the original demo database.
- Point the local app at the recovery database only under owner approval. Restore a client generated from the saved pre-treasury schema, disable the optional treasury service, and restore the prior reporting adapter before resuming the previous application behavior. The new treasury module must remain unavailable on the old schema.
- If any new business documents have been posted after cutover, do not automatically restore the older backup: reconcile or repair forward to avoid losing those documents.

No migration, grant change or rollback against the demo database is authorized by this document alone.
