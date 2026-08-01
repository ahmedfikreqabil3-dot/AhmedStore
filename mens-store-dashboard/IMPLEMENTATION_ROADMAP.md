# Ahmed Store - Implementation Roadmap and Handover

Last updated: 2026-07-25

## Current architecture

The application is now a local-first desktop-browser system:

- The existing Arabic HTML/CSS/JavaScript application remains the user interface.
- `Start-Ahmed-Store.bat` starts the local Node.js server and opens the app at `http://localhost:3000`.
- The server uses SQLite built into Node.js (`node:sqlite`), so there is no Java, online service, or separate database installation.
- Primary database: `data/ahmed-store.db`.
- Consistent backups: `data/backups/` via `POST /api/backups`.
- The old browser snapshot is temporarily retained for screens not yet migrated to server APIs. It is a compatibility bridge, not the long-term source of truth.

## Completed improvements

### Stability and usability

- Restored the legacy application script after corruption and retained the damaged copy as `app.damaged-2026-07-25.js` for reference.
- Fixed Arabic error handling so application failures no longer appear as unreadable question marks.
- Improved contrast for sales prices and dashboard chart indicators.
- Updated the service-worker cache version so delivered static changes are refreshed.
- Added `Start-Ahmed-Store.bat` to start the application and server together.

### Local persistence and recovery

- Added a local SQLite service in `local-server/`.
- Added schema migrations and a versioned migration history table.
- Added a local JSON snapshot endpoint with revision checking to avoid silent overwrite conflicts.
- Added an import of the previous browser data into normalized SQLite tables.
- Imported the initial live data successfully: 2 warehouses, 12 products, 4 customers, and 88 historical sales.
- Added live SQLite backup creation using `VACUUM INTO`.

### Normalized business model

The database now stores normalized records for:

- organizations and users
- warehouses and categories
- products and customers
- sales, sale items, and payments
- immutable inventory transactions
- audit logs
- returns, return items, and return payments

### Server-backed business workflows

- Product and customer create/update operations are mirrored to the normalized API.
- New POS sales are committed atomically by the local server before the browser changes stock or reports success.
- A successful sale writes the sale, items, payments, inventory movement, and audit record together.
- Insufficient stock and invalid payment totals are rejected before any data is written.
- The print-after-sale flow waits for successful asynchronous completion.
- Full and partial refunds are supported through `POST /api/v1/returns`.
- A return checks the original invoice and prior returned quantities, restores stock, records the refund payment, and marks a sale as fully returned only when all quantities are returned.
- The existing Returns screen now reads invoice returnability from the server before allowing a server-backed refund.

## Validation completed

- `node --check app.js` passes.
- `node --check local-server/server.mjs` passes.
- `node --check local-server/src/business.mjs` passes.
- `npm.cmd test` in `local-server/` passes.
- Tests cover product/customer updates, sale completion, insufficient-stock rejection, credit validation, stock adjustment, partial return, excess-return rejection, and stock restoration.
- The running service was checked against the existing database after restart. Historical invoice `#1088` was read successfully without modifying data.

## Important operational notes

- Always start the app with `Start-Ahmed-Store.bat`, not by opening `index.html` directly. The `file://` version cannot use the SQLite API.
- Do not delete `data/ahmed-store.db` or `data/backups/`.
- Copy the backup folder to a USB drive or another disk regularly.
- The initial browser data is tied to the old `file://` origin. If a browser still has data only in that origin, export JSON there and import it after opening `http://localhost:3000`.
- There is no real authentication on the local API yet. The browser login is still the legacy application login. This is acceptable only while the app runs on a trusted local computer/network.

## Known limitations / deliberate temporary boundaries

- Browser snapshot data is still used by several legacy pages, including expenses, purchases, suppliers, treasury, debt settlement, reports, and settings.
- Exchange and store-credit return options are intentionally blocked when using the server. They must not be treated as cash refunds; they need dedicated accounting records first.
- The local server currently binds to the normal local server configuration without user/role authorization on its endpoints.
- Product/customer deletion is not yet represented as a normalized server operation.
- Dashboard and reports are still calculated mostly from the legacy snapshot.
- The `modern-app/` React/Vite scaffold and earlier Supabase artifacts are not the active implementation path. The chosen path is the lighter local Node + SQLite architecture.

## Recommended next phases

### Phase 1 - Complete the money and return model

1. Add normalized treasuries, cash movements, and shift opening/closing balances.
2. Make a completed sale create a cash/bank movement.
3. Make a refund create the opposite movement.
4. Implement store credit as a customer-credit ledger entry.
5. Implement exchange as a linked return plus a new sale, not as a single ambiguous action.
6. Connect debt charges and debt payments to the normalized customer ledger.

**Acceptance criteria:** every currency movement has an immutable source record, a payment method, a treasury, an operator, and an audit trail.

### Phase 2 - Move remaining operational screens to APIs

1. Add server APIs and transactions for suppliers, purchases, purchase invoices, stock transfers, stock adjustments, expenses, and recurring expenses.
2. Replace direct browser-snapshot writes screen by screen.
3. Add server-side soft deletion / archival for products and customers.
4. Remove dual-write logic only after each screen is migrated and verified.

**Acceptance criteria:** inventory and money cannot be changed by editing browser snapshot data alone.

### Phase 3 - Reporting and data integrity

1. Build dashboard and reports from SQLite queries rather than snapshot arrays.
2. Add report filters by date, warehouse, cashier, customer, and payment method.
3. Add daily sales, gross profit, low-stock, stock valuation, customer balance, and cash reconciliation reports.
4. Add audit-log viewer and export to CSV/Excel.
5. Add a database integrity/health check and backup-restore drill.

**Acceptance criteria:** dashboard totals reconcile to normalized transactions and a backup can be restored on another machine.

### Phase 4 - Security and deployment hardening

1. Move user passwords into server-side salted hashes; require a password change from defaults.
2. Add authenticated local API sessions and role checks to every endpoint.
3. Restrict network exposure if the system is used only on one computer.
4. Add automatic scheduled backup reminders and a visible "last backup" status.
5. Package the local service for a non-technical user if required (for example, a Windows shortcut/installer).

**Acceptance criteria:** default credentials are gone, unauthorized browser users cannot call data APIs, and recovery is documented and tested.

## Suggested resume point

Resume with **Phase 1: treasuries and cash movements**. This unlocks correct refunds, exchanges, store credit, debt settlement, and cash reconciliation without risking misleading financial totals.
