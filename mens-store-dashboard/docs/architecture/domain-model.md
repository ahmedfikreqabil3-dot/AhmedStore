# Domain model and integrity rules

## Bounded domains

| Domain | Core entities | Invariants |
| --- | --- | --- |
| Identity | Organization, User, Role, Permission, Session, AuditEvent | Every request is scoped to one organization and authenticated user. |
| Catalogue | Product, Category, Barcode, Price | Product prices and status are versioned/audited when used by commerce. |
| Inventory | Warehouse, InventoryTransaction, StockTransfer, StockAdjustment | Available stock is calculated from the immutable ledger, never overwritten directly. |
| Commerce | Sale, SaleLine, Payment, Return, ReturnLine | Sale/return write sets are atomic and idempotent. A return cannot exceed the original sold quantity minus prior returns. |
| Parties | Customer, CustomerLedgerEntry, Supplier, SupplierLedgerEntry | Balances derive from ledgers; no direct balance mutation. |
| Finance | Treasury, TreasuryTransaction, Expense, Shift | Every money movement has a source type/id, payment method, actor, and timestamp. |
| Documents | Quotation, HeldInvoice, PurchaseOrder, PurchaseInvoice | Non-posting documents cannot affect stock or money until explicitly posted. |

## Required PostgreSQL controls

- `organization_id` on all tenant-owned records, including a composite index
  beginning with it for common lookups.
- UUID primary keys; legacy numeric ids stored in dedicated external-reference fields.
- `numeric(19,4)` for all money, quantities, prices, discounts, and exchange
  rates. JavaScript `number` must not decide financial totals.
- Database foreign keys, check constraints, uniqueness constraints, and
  transaction isolation for all posting workflows.
- Optimistic concurrency/version fields for editable master data and idempotency
  keys for client-submitted financial commands.
- Soft deletion/archival for referenced records; never delete posted documents.
- Append-only audit events for sensitive actions: price changes, permission
  changes, postings, voids, returns, adjustments, and exports.

## Posting rules

1. A sale succeeds only when all sale lines have sufficient stock in the selected warehouse.
2. Payment amounts must exactly equal the final sale total, except for approved change-handling rules.
3. A credit sale requires an eligible customer and writes a customer-ledger entry.
4. A return references original sale lines and cannot exceed remaining returnable quantity.
5. A stock transfer posts paired `TRANSFER_OUT` and `TRANSFER_IN` movements in one transaction.
6. Purchase receipt posts stock only once; retries must reuse an idempotency key.
7. Financial movement sums are calculated using PostgreSQL `numeric`, not floating point.
