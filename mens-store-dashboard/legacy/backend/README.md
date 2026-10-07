# Ahmed Store Local Server

This server keeps the authoritative store data in `../database/runtime/ahmed-store.db` using SQLite built into Node.js. No internet, Java, or database service is required.

## Run

From this folder, run:

```powershell
node server.mjs
```

Open `http://localhost:3000` on the server computer. Other devices on the same network can use `http://<server-computer-ip>:3000`.

## Backups

Create a consistent live backup with:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/api/backups
```

Backups are stored under `../database/runtime/backups`. Copy this folder regularly to another disk or USB drive.

## Current data authority

New product and customer changes are mirrored to the normalized SQLite tables.
New POS sales are committed atomically by the local server before the browser
shows them as completed, so the sale, payments, and inventory movement cannot
be partially saved. The server also provides `POST /api/v1/returns` for a
full or partial return: it validates the original sale quantities, restores
stock, and records the refund in one transaction.

The legacy browser snapshot remains temporarily for screens that have not yet
been moved to normalized server APIs. Do not delete `../database/runtime/ahmed-store.db`;
the launcher and automatic backups use this file.
