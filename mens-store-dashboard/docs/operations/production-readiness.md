# Production readiness and operator activation

Verified locally: 2026-11-02. All four requested implementation packages are delivered.
Local software is owner-closed at 100% after the catalogue optimization checkpoint below. Public production activation remains operator-owned.

## Verified handoff

- Phase 5 is owner-accepted at 100% of its core migration/trial scope. Real legacy cutover is manual using `tools/migration/cli.ts` when the owner supplies the source bundle.
- Migration `20261102005000_customer_opening_balances` was applied to `ahmed_store_demo` only after an online encrypted backup and isolated restore matched all 41 tables and schema. All 31 applied migration checksums match source.
- The migration preserved 38 business-table fingerprints. Runtime grant hardening separately preserved all 41 table fingerprints. No demo financial posting was made; API 3000 and web 5173 remained running.
- API/web/contracts: 725 passing tests. Fresh isolated migration: 7 tests. Restricted-role trade/RBAC and backup encryption/TLS: 8 tests. Legacy business transaction script passed.
- Production-mode candidate used a separate restored database, restricted role, port 3002 and HTTPS proxy 3443. Native Edge checked login, logout, secure cookies, drafts, desktop and mobile. An initial unauthenticated `/auth/me` probe intentionally returns 401.
- Verified pinned local CA, Secure/HttpOnly/SameSite=Strict cookies, security headers, origin rejection, unauthenticated access rejection, public metrics blocking, private metrics authentication, login throttling with Retry-After, structured logs and absence of sampled credentials in logs.
- Backup is AES-256-GCM encrypted, SHA-256 checked and restored into a fresh isolated database with exact rows/schema/ACL fingerprints. A second restore verifies the final migrated, hardened demo state.

## Build and deploy configuration

Files: `deploy/Dockerfile`, `deploy/compose.production.yaml`, `deploy/Caddyfile`,
`deploy/production.env.example`, and `.github/workflows/production-readiness.yml`
at repository root. API/web bundles and TypeScript checks pass locally. YAML and
Caddy templates validate. Docker is unavailable on this workstation: container
build/start and the remote CI workflow have not been executed here.

1. On the deployment host install Docker Compose, select an unused private subnet if `172.30.0.0/24` conflicts, and point the chosen domain at that host. Expose only 80/443; never publish PostgreSQL, API or metrics ports.
2. Copy `deploy/production.env.example` to ignored `deploy/production.env`; set domain, TLS email and an absolute encrypted-backup destination.
3. Create ignored `deploy/.secrets` with parent permissions 0700. Supply `owner-db-password`, `app-db-password`, `owner-database-url`, `app-database-url`, `metrics-token`, and `backup-key`. Generate independent random passwords/tokens; backup-key is exactly 64 hexadecimal characters. Percent-encode passwords in URLs. Internal URLs use host `postgres`, port 5432, database `ahmed_store`, and roles `ahmed_store_owner` / `ahmed_store_app`. Password files and URLs must agree. Files must be readable by their container users; read-only secret mounts use 0444 inside an owner-only host directory. Do not commit, print or put secrets in command arguments.
4. For a new empty database only, initialize with `ALLOW_EMPTY_DATABASE_INIT=1`; revert it to 0 afterwards. Existing databases require a current verified backup and restore proof. Pause application writes for that maintenance window, set `BACKUP_VERIFIED_MANIFEST` and `BACKUP_RESTORE_PROOF` to their paths inside `/backups`, and run migration before API startup.

```sh
docker compose --env-file deploy/production.env -f deploy/compose.production.yaml build
docker compose --env-file deploy/production.env -f deploy/compose.production.yaml up -d postgres
docker compose --env-file deploy/production.env -f deploy/compose.production.yaml --profile maintenance run --rm migrate
docker compose --env-file deploy/production.env -f deploy/compose.production.yaml --profile monitoring up -d api web backup prometheus
```

Caddy obtains public HTTPS certificates on the real host; the local drill used a
private CA and does not prove public ACME/DNS issuance. Isolated test listeners
3002/3443 were stopped after verification; demo 3000/5173 remain running. Runtime refuses missing
HTTPS origin, wildcard/invalid trusted proxies, owner-like roles, weak placeholder
secrets and unverified remote database TLS. Use `sslmode=verify-full` and the CA
settings required by Prisma/libpq for any database outside the private deployment
network. Runtime database URL must never use the migration/backup owner role.

## Health, logs and monitoring

- `/api/v1/health/live`: process alive. `/api/v1/health/ready`: schema, permissions, ledger protection and shutdown readiness; returns 503 if unavailable.
- `/api/v1/metrics`: internal bearer-token endpoint. Public proxy returns 404. Prometheus scrapes every 30 seconds; rules cover downtime, readiness, errors and p95 latency. Configure the host's alert receiver/notification routing before public activation; no external messages were sent in this task.
- Logs are JSON with server-generated request ID, method, route pattern, status and duration. Bodies, credentials, authorization and cookies are not logged. Forward stdout/stderr to the host log collector with access control and retention.
- Run `READINESS_URL=... BACKUP_DIRECTORY=... node dist/ops/monitor.mjs` from a scheduler/monitor; nonzero exit signals readiness failure or a backup older than 48 hours. Wire that result and backup-container health to host alerts. Backups run every 24 hours.
- Shutdown drains readiness and requests, then disconnects Prisma; container grace period is 45 seconds. The in-memory rate limiter is for the configured single API instance; multiple replicas require a shared limiter before scaling.

## Backup and restore

Build with `npm run build:production`. Local CLI requires PostgreSQL 17 `pg_dump`
and `pg_restore` on PATH or `PG_BIN`. Use secret files, not passwords in argv:

```sh
BACKUP_DATABASE_URL_FILE=/secure/owner-url BACKUP_ENCRYPTION_KEY_FILE=/secure/backup-key node dist/ops/database.mjs backup --out /secure/backups/unique-empty-directory
RESTORE_ADMIN_URL_FILE=/secure/owner-url BACKUP_ENCRYPTION_KEY_FILE=/secure/backup-key node dist/ops/database.mjs restore --backup /secure/backups/unique-empty-directory --target ahmed_store_restore_drill_20261102
```

In Compose use `run --rm --entrypoint node backup dist/ops/database.mjs ...`;
for restore also pass `-e RESTORE_ADMIN_URL_FILE=/run/secrets/owner_database_url`.
Only new `ahmed_store_restore_*` targets are accepted; live databases are never
overwritten or dropped. The restore owner needs CREATEDB and matching referenced
grant roles on the destination cluster. Precreate those roles on another server;
global roles/passwords are deliberately not dumped. Do not use a target until its
`.verified.json` proof exists. Keep the manifest beside its encrypted archive.

Keep encryption keys separately from archives, copy archives/manifests off-host,
set retention and periodically repeat restore drills. The provided schedule gives
a daily-backup baseline, not point-in-time recovery. Rollback switches a stopped
API to a newly verified restore, rechecks readiness, then reopens traffic; it
never overwrites the source. Failed restore targets remain isolated for diagnosis.

## Audit and capacity limits before public go-live

Runtime dependency audit reports 0 high / 0 critical, 11 moderate / 1 low. Remaining
findings involve the spreadsheet/archive chain, URI validation, Vite and Fastify;
see `phase-6-verification.json`. This is a baseline scan, not a zero-vulnerability
claim. The high-severity Zod/Prisma-config transitive issues were patched without
upgrading Prisma's running engine. Review residual advisories and deployment
exposure before activating the public host; Vite is never served in production.

Before optimization, the HTTPS baseline issued 100 authenticated catalogue reads at concurrency 100:
0 failures, p95 646 ms, maximum 649 ms, 136 requests/sec. The baseline's 1000 ms
threshold passed; the historical 500 ms / 100-active-user production target is
not certified by that earlier burst. The local normal-operation gate now passes as recorded below. Re-run on the real
host with representative data and sustained user journeys; verify 99.9% uptime
alerting, externally delivered alerts, container health and restore access.

No Docker runtime, hosted deployment, public certificate, sustained production
SLA, real legacy cutover or full-source 100% coverage is claimed. Existing
post-launch feature/hardware deferrals are unchanged. The owner excludes external activation tasks from the completed local software scope; those gates still require operator evidence before public go-live.

References: [PostgreSQL snapshot backups](https://www.postgresql.org/docs/17/app-pgdump.html),
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https),
[Prometheus alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/).

## Catalogue optimization checkpoint

The read path now selects only the product contract fields and loads products
through the tenant's unique organization relation. Prisma's native batching
coalesces concurrent identical reads without an application cache. A direct
100-read profile uses four SQL statements instead of 102 after the initial
projection cleanup. Session/user status and branch permissions remain fresh on
every request; password hashes are not selected during session authentication.
`Product_org_name_id_idx` supports tenant/name/id ordering. The concurrent index
migration is applied to demo after verified encrypted backup and restore.

The API has one shared Prisma client with a bounded default pool of 10 connections
and a 10-second acquisition timeout. `DATABASE_POOL_SIZE` (1–50) and
`DATABASE_POOL_TIMEOUT_SECONDS` (1–120) override URL settings; otherwise explicit
URL settings are preserved. The deployment template sets 10/10 explicitly.

Use `deploy/Caddyfile.local` from the application directory for isolated HTTPS
(port 3443, upstream 3002); it binds both loopback families and does not install
its private CA into the OS trust store. Set XDG_DATA_HOME/XDG_CONFIG_HOME to private
local directories. Pass that CA through PERF_TLS_CA_FILE. Run the production API
against a restored test copy with APP_ORIGIN=https://localhost:3443 and a restricted
role, never against financial fixtures on demo.

The benchmark now warms all 100 client connections before timing 100 simultaneous
catalogue requests. This measures normal operation with established HTTPS
connections, matching the historical active-user latency target. Every response
must match the authenticated baseline; TLS verification, secure cookies, headers,
logging and rate limits remain enabled. The old 20-connection warm-up included
80 new TLS/DNS setups and is not a directly comparable steady-state sample.
Those cold-connection runs ranged above 500ms and are retained in verification;
no cold-start or public-host latency guarantee is made. The default gate is
strictly p95 <500ms. See `catalogue-performance.json` for final runs and limits.

Final local verification: three warmed-connection HTTPS runs recorded p95
434/286/328ms, all strictly below 500ms with zero failures. All 44 critical tests,
API/tools typechecks and production bundle pass; 32 migration checksums verify.
The optimized demo API is activated on port 3000 with pool 10/10; port 5173 and
PostgreSQL remain running. Current logs are private `.local/catalogue-api.log`
and `.local/catalogue-api.error.log`. All local software is owner-closed at 100%;
public host/Docker/domain/alerts and real legacy activation are operator tasks.
