# Phase 0 verification record

Reviewed on 2026-10-07 against the legacy source:

| Evidence | What it verifies |
| --- | --- |
| `legacy/frontend/app.js:345-391` | Legacy roles, pages, action permissions, and the fact that authorization is currently client-side. |
| `legacy/frontend/app.js:1650-1840` | POS requires a customer, accepts split payments, changes stock, debt, treasury, and sale state. |
| `legacy/frontend/app.js:3602-3784` | Return lookup, quantity selection, stock restore, and refund behavior. |
| `legacy/frontend/app.js:3389-3599` | Expenses, suppliers, purchase orders, and receipt behavior. |
| `legacy/frontend/app.js:3911-3980` | Debt settlement and quotations. |
| `legacy/frontend/app.js:4593-4865` | User management, warehouses, and stock transfers. |
| `legacy/frontend/app.js:5620-6157` | Purchase invoices, adjustments, treasuries, and treasury transactions. |
| `legacy/backend/src/business.mjs` | Existing SQLite transaction patterns for products, customers, sales, and returns. |

The architecture documents preserve observed behavior and identify the four
behavioral decisions that require explicit approval before migration. No legacy
rule has been intentionally changed in Phase 0.
