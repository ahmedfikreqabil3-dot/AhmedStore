# Database role handoff

Prisma migrations run through a controlled migration role. The API runs through
the least-privileged application role. When a migration creates a new table,
the database deployment step must grant the runtime role only the operations it
needs before deploying the API.

For the treasury ledger and expenses, the local development role is configured with:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "TreasuryTransaction" TO ahmed_store_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Expense" TO ahmed_store_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Supplier", "Purchase", "PurchaseLine", "PurchasePayment", "PurchaseReturn", "PurchaseReturnLine", "SupplierLedgerEntry" TO ahmed_store_app;
```

In staging and production, replace `ahmed_store_app` with that environment's
runtime role. Run this grant after `prisma migrate deploy` and before the API
deployment. This keeps schema ownership separate from application access and
prevents a new table from causing a runtime posting failure.
