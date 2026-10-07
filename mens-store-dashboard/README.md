# Ahmed Store

Ahmed Store is a sales and inventory platform being rebuilt for team ownership,
high reliability, and future online deployment. The working SQLite application
is preserved under `legacy/` while the production platform is built in parallel.

## Project layers

```text
apps/web/             React + TypeScript + Vite frontend
apps/api/             Fastify + TypeScript API
packages/contracts/   Shared Zod API contracts
database/prisma/      PostgreSQL schema and reviewed migrations
docs/                 Architecture decisions and delivery plan
legacy/               Preserved current SQLite application
```

The web application talks only to the versioned API. The API owns validation,
authorization, transactions, inventory movements, and PostgreSQL access.

## Run locally

Install workspace dependencies, then run quality gates:

For development:

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run coverage
```

## Legacy application

The previous local application remains available through
`legacy/Start-Legacy-Ahmed-Store.bat`. It is not the production target and will
be retired only after data migration, reconciliation, and business acceptance.

See [ADR 001](docs/adr/001-production-stack.md) and the
[delivery plan](docs/architecture/delivery-plan.md).
