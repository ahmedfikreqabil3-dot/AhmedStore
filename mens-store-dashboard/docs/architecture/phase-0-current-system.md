# Phase 0: Current-system review

## Evidence reviewed

The review is based on `legacy/frontend/app.js`, the SQLite transition backend
in `legacy/backend/`, and the visible user interface. The legacy application
is the behavioral reference during migration; it is not the target architecture.

## Current business flows

| Flow | Current behavior | Migration rule |
| --- | --- | --- |
| Login and users | Browser compares legacy credentials and applies page/action permissions client-side. | Replace with server sessions, password hashes, RBAC, and audit events. |
| Product catalogue | Creates, updates, deletes, and displays product price, cost, barcode, category, minimum stock, and warehouse stock. | Product master-data edits must be authorized and audited. No hard delete after transactional use. |
| Point of sale | Requires a selected customer, calculates discount and split payment, checks stock, reduces stock, updates debt/treasury, saves a sale, and can print. | One PostgreSQL transaction must atomically save sale, lines, payments, inventory ledger, receivable, treasury movement, and audit event. |
| Returns | Finds an invoice, selects whole/partial lines, restores stock, and records a refund. The SQLite bridge supports server-backed cash refunds. | Preserve partial-return limits; introduce exchanges and store credit only with separate financial ledger entries. |
| Customers and debt | Maintains contact data, purchase totals, visit count, debt history, and debt payment. | Replace mutable debt fields with an immutable customer ledger and calculated balance. |
| Suppliers and purchasing | Records suppliers, purchase orders, receipts, and purchase invoices. | Receipt must add immutable inventory movements and supplier-payable entries. |
| Warehouses and inventory | Maintains warehouses, stock transfers, stock adjustments, and low-stock display. | Store stock only as the sum of inventory ledger movements; transfer must be a paired, atomic out/in transaction. |
| Treasury and expenses | Maintains multiple treasuries, manual transactions, expenses, and shift data. | Money movements must be immutable, linked to a source document, and reconciled by treasury/shift. |
| Quotations and held invoices | Saves quotations and held invoices, and can convert a quotation into a sale. | These are non-posting documents until conversion; conversion must remain idempotent. |
| Reports | Calculates sales, inventory, expenses, treasury, and customer balances in the browser. | Move reporting to backend queries/read models after transactional data is migrated. |

## Existing behavior that needs explicit business agreement

- A customer is mandatory for every POS sale today. Retain this until a product
  decision explicitly allows an anonymous/walk-in customer.
- Legacy exchange and store-credit returns are not yet financially safe. They
  must not be enabled in the new platform until their accounting rules are approved.
- Legacy users may have custom page permissions in addition to their role.
  The target authorization model must preserve approved exceptions or formally retire them.
- Historical data contains browser-generated numeric identifiers. The migration
  will preserve them as external references, while production records use UUIDs.
