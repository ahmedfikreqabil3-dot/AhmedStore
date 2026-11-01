# Run AhmedStore locally

The current React/Fastify app is installed on this device with an isolated Node 24.18 runtime and PostgreSQL 17.10 database.

- Web app: http://localhost:5173
- API health: http://localhost:3000/api/v1/health
- Database: 127.0.0.1:55432, ahmed_store_demo
- Demo login: see .local/credentials.json (organizationId, email, password).

Run Start-Local.ps1 from PowerShell to start the database, API, and web app.
Run Stop-Local.ps1 to stop them while preserving demo data.

The .local folder contains the runtime, database, logs, demo credentials, and setup helper. It and .env are ignored by Git. Keep them on this device. This setup uses a separate database and does not migrate the legacy SQLite data.

The live React application now records authenticated sales, including exact discounts and split payments, for authorized seller roles, including cashiers. Use the separate design-preview.html page for mock data. Cashiers use a dedicated sale-options endpoint that excludes purchase costs and does not grant inventory-management permissions. Other delivery-plan work remains incomplete.

Verified during setup: all 17 database migrations, frontend production build, backend TypeScript check, API health, demo login, nine authenticated read endpoints, and rejection of unauthenticated product requests. Visual browser automation could not be completed because the browser tool timed out.
