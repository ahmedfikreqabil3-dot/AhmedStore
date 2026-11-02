# Phase 5: isolated migration and trial cutover

## Owner closure — 2026-11-02

Phase 5 is accepted at 100% core scope. Real legacy cutover will be performed
manually with this CLI when the owner is ready. Migration
`20261102005000_customer_opening_balances` is now applied to `ahmed_store_demo`
after verified backup/restore; earlier trial evidence below describes its
historical isolated-only state. See [current verification](phase-6-verification.json)
and [production handoff](production-readiness.md).

## Scope and safeguards

Templates cover categories, branches, products, customers, suppliers, treasury
accounts, stock openings and customer/supplier/treasury opening balances. Numeric
values are decimal strings with at most four fractional places; no floating-point
money is accepted. Positive customer amounts are receivables; positive supplier
amounts are payables. Negative party amounts represent advances. Stock and
physical treasury openings are nonnegative. Zero openings create no ledger row.

Use `tools/migration/templates/opening-empty.json` as the contract skeleton and
`opening-example.json` as a synthetic, complete worked example. External keys are
stable and referenced across sections. Do not put passwords in import bundles.
An existing legacy dataset has not been supplied for a real production cutover;
the executed trial uses the synthetic example and a verified read-only database
backup copy. No legacy business document is fabricated to create opening debt.

The importer creates a fresh mapped organization in a trial database, in one
serializable transaction, with a transaction-scoped lock and final audit.
Deterministic IDs, an immutable normalized payload hash and one opening batch per
organization prevent duplicate posting. The same batch/payload replays; a changed
payload or second opening batch is rejected. No merging into a populated tenant
is permitted. New bootstrap credentials come from environment variables and are
never included in the import hash or public report.

## Commands

Use the project's portable Node 24 if Node 24 is not on PATH. From the application
root, commands below use `node` as that executable.

```powershell
node --import tsx tools/migration/cli.ts validate tools/migration/templates/opening-example.json
node --env-file=.local/test.env --import tsx tools/migration/trial.ts --backup-manifest .local/core-step3-backup.json --file tools/migration/templates/opening-example.json --out .local/phase5-trial
```

The trial requires the local owner URL for `ahmed_store_api_tests` as its admin
connection source and the verified Phase 4 read-only backup manifest. It verifies
the backup's original table fingerprints, creates isolated baseline/trial copies,
and applies migrations only to those copies. The demo API and database remain
running. Migration `20261102005000_customer_opening_balances` extends the customer
ledger check for explicit signed `OPENING_BALANCE` entries and the audited import
kind/count checks for opening batches, retaining existing customer-import limits; it is not applied to
`ahmed_store_demo` by this trial.

For a trial database already created by the runner, set
`MIGRATION_DATABASE_URL`, `MIGRATION_ADMIN_EMAIL` and
`MIGRATION_ADMIN_PASSWORD`, then run:

```powershell
node --import tsx tools/migration/cli.ts dry-run your-opening-bundle.json
node --import tsx tools/migration/cli.ts apply your-opening-bundle.json
node --import tsx tools/migration/cli.ts reconcile your-opening-bundle.json
```

The CLI refuses the demo database, ordinary API test database, backups, remote
hosts and other database names. Only local `ahmed_store_phase5_trial_*` databases
on port 55432 are writable targets. `validate` needs no database connection.

## Automated trial protocol

1. Verify the source backup against its original fingerprints and read-only flag.
2. Clone it, apply isolated schema changes, and compare all historical business data.
3. Freeze a read-only baseline and clone a writable trial from it.
4. Run critical validation, signed-opening, concurrent replay, altered-payload,
   discrepancy-detection and audit-failure rollback tests. Confirm fixture cleanup.
5. Import in dry-run mode, reconcile, force transaction rollback and compare every
   public table to the baseline.
6. Commit, reconcile, repeat the same import and verify unchanged table fingerprints.
7. Disconnect and replace only the runner-created trial database from its frozen
   baseline. Compare every table to prove whole-database rollback.
8. Reapply the verified bundle to leave a populated review copy. Confirm demo
   business/master/schema fingerprints are unchanged.

Private reports, credentials and logs live under `.local/phase5-trial/` (ignored by
Git). Public evidence contains no credentials. Trial copies are not a production
cutover and do not authorize replacement of the live demo. For real data: freeze
the source at the approved UTC cutover time, prepare/validate the bundle, perform
this protocol on a fresh approved backup, reconcile and record the source mapping
and sign-off before any production activation. Production readiness remains Phase 6.

## Recorded trial result

See [verification](phase-5-trial-verification.json): 719 application/contract tests
and the legacy business test passed, followed by seven migration checks. Source
backup fingerprints, 39 historical business tables, 41 rollback tables, original-key
replay and unchanged demo business/schema data were verified. The final populated
trial and frozen baseline are retained; credentials remain private under `.local`.
