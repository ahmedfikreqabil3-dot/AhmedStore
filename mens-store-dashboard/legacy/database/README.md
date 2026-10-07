# Database layer

## Runtime database

The application uses SQLite through Node.js's built-in `node:sqlite` module.
The live database is created on first start at:

```text
runtime/ahmed-store.db
```

Backups created through `POST /api/backups` are stored under:

```text
runtime/backups/
```

`runtime/` is excluded from Git. Do not commit, delete, or share the live
database casually because it contains real store information.

## Migrations and ownership

The backend owns schema migrations in `../backend/src/database.mjs`. Migrations
run automatically when the backend starts and are recorded in the
`schema_migrations` table. Business transactions live in
`../backend/src/business.mjs`; frontend code must use API endpoints rather than
write database data directly.

## Backup and recovery

1. Create a live backup: `Invoke-RestMethod -Method Post http://localhost:3000/api/backups`
2. Copy `runtime/backups/` to another disk or USB drive regularly.
3. To restore, stop the backend, preserve the current database, then replace
   `runtime/ahmed-store.db` with a known-good backup and restart the backend.
