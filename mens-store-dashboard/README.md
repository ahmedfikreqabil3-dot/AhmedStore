# Ahmed Store

Ahmed Store is a local-first sales and inventory application. It runs entirely
on a store computer with Node.js and SQLite; no Java, cloud account, or separate
database server is required.

## Project layers

```text
frontend/       Browser user interface (HTML, CSS, JavaScript, PWA assets)
backend/        Node.js HTTP API and business rules
database/       Database documentation and local SQLite runtime location
database/runtime/  Generated database and backups (ignored by Git)
```

The frontend talks only to the backend's `/api` endpoints. The backend owns
validation, transactions, inventory movements, and SQLite migrations.

## Run locally

Double-click `Start-Ahmed-Store.bat`, then open `http://localhost:3000`.

For development:

```powershell
cd backend
npm.cmd test
node server.mjs
```

## Database

The database file is created at `database/runtime/ahmed-store.db` on first
start. It and its backups are deliberately ignored by Git because they contain
live business data. See [database/README.md](database/README.md) for recovery
and backup guidance.
