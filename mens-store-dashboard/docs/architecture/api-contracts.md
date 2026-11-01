# API contract baseline

## Current vs target — 2026-10-29 audit

The conventions/examples below describe the target, not a claim that all listed
routes exist. Current app.ts mixes bounded offset lists with unbounded directory
lists and commonly returns string error codes rather than the full proposed
envelope. Full sales detail, party settlements, treasury administration
and broad reporting remain gaps. Track explicit decisions/closure in B04/B11–B16;
screens must not assume that proposed endpoint examples are live.

## Verified stock commands and read models — 2026-10-30

- `GET/POST /inventory/transfers`: inventory writers (admin/manager/warehouse).
  Bounded list defaults to 50, maximum 200. Posting requires `Idempotency-Key`,
  distinct scoped active warehouses, a positive quantity and a reason. Paired
  entries, audit and replay record commit together. HTTP 201 creates, 200 replays.
- `POST /inventory/movements`: positive opening only before any movement for that
  product/warehouse, or a signed nonzero adjustment. Negative adjustments must
  preserve both current and all later historical balances. Repeated opening,
  unavailable resources or insufficient stock return 409. Original-key replay
  is checked inside the serializable transaction before new resource validation.
- `GET/POST /inventory/counts`: inventory writers, list default 25/max 100.
  Input includes warehouse, occurredAt, reason and 1–100 distinct products with
  `expectedQuantity` and nonnegative `countedQuantity`. Snapshot mismatch returns
  `STOCK_CHANGED`/409. Reductions also check historical stock. Zero differences
  retain count evidence without inventory entries. Header, snapshots, nonzero
  adjustments, audit and idempotency record are atomic; 201 creates/200 replays.
- `GET /inventory/thresholds`: inventory writers or report readers. Query:
  `mode=low|all` (default low), optional warehouseId/asOf, limit (25/max 100),
  offset. Results include exact quantities as of the returned timestamp, current
  configured minimum, names and configuration version. Only active resources
  with explicitly configured thresholds are listed; low means quantity <= minimum.
  Historical stock is compared with current threshold settings, not a fabricated
  historical settings snapshot.
- `PUT /inventory/thresholds`: inventory writers. Strict productId/warehouseId/
  nonnegative minimum/expected version. Version 0 creates; later versions update
  only the matching prior state. Conflicts return `VERSION_CONFLICT`/409. This
  reversible configuration write uses optimistic versioning instead of a stock
  posting idempotency key. After an uncertain response, read back the current
  configuration before a new edit. Audit and setting change commit atomically.

New inputs reject injected organization/actor fields. Session scope is
authoritative. All above quantities cross JSON as decimal strings. Their tests
use a disposable organization in the separate test database, not demo stock.

## Conventions

- Base path: `/api/v1`.
- JSON request/response bodies, UTF-8, ISO 8601 timestamps, UUID identifiers.
- Authenticated routes derive `organizationId` and actor identity from the server session; clients never supply an organization scope for operational data.
- Money and quantity values cross the API as decimal strings, for example `"1250.00"`, not JSON floating-point values.
- Every write command accepts an `Idempotency-Key` header and returns the prior successful result for safe retries.
- Errors use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.
- Pagination uses bounded cursor pagination, not unbounded lists.

## Initial endpoint groups

| Group | Examples | Required authorization |
| --- | --- | --- |
| Identity | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /users` | Public only for login; user administration otherwise. |
| Catalogue | `GET/POST/PATCH /products`, `GET /categories` | Read product or manage catalogue. |
| Parties | `GET/POST/PATCH /customers`, `GET/POST/PATCH /suppliers` | Read/manage respective party. |
| Inventory | `POST /inventory/movements`, `POST /stock-transfers`, `GET /inventory/stock` | Inventory posting permission. `POST /inventory/movements` currently permits only immutable opening-balance and adjustment movements and requires `Idempotency-Key`. |
| Commerce | `POST /sales`, `GET /sales/:id`, `POST /returns` | Sell/return permission plus warehouse scope. |
| Finance | `POST /expenses`, `POST /customer-payments`, `GET /treasuries` | Finance permission. |
| Reporting | `GET /reports/sales`, `GET /reports/inventory` | Report-read permission. |

## Contract generation

Zod schemas in `packages/contracts/` are the source of truth for request and
response payloads. The API validates input at the boundary; the React client
uses the same schemas/types. OpenAPI generation is a Phase 2 deliverable after
authentication and error handling are complete.
# Customer credit and account statements — 2026-10-30

`GET /api/v1/customers/:partyId/statement` and
`GET /api/v1/suppliers/:partyId/statement` accept required `from`/`to` dates and
bounded `limit` (default 25, maximum 100) and `offset` (maximum 100000).
Dates are inclusive. Invalid/reversed periods, invalid IDs and unknown query
fields return 400; missing tenant-scoped parties return 404. The organization
comes only from the authenticated session. Customer statements require seller
or reporting permission; supplier statements require purchasing or reporting
permission. Missing read-service wiring returns 503.

Responses contain the party, period, exact signed four-decimal opening/closing
balance, period increases/decreases, total and paginated movements with running
balances. Running balances are calculated before pagination in a repeatable-read
snapshot. Archived parties remain readable. Positive means money owed by the
customer or owed to the supplier respectively. SQL timestamp comparisons use
explicit UTC values so session timezone does not shift boundary movements.

Sales now post immutable `CustomerLedgerEntry` credit movements in their stock/
treasury/audit transaction. Invoice returns and approved no-invoice returns reduce
the customer balance; return replacement retains the original movement and posts
its reversal and the new return movement. Pending requests have no ledger impact.
Zero credit limit means unlimited; a positive limit caps the resulting debt for
a new credit sale. `CREDIT_LIMIT_EXCEEDED` returns 409 without partial posting.
Original-key replay precedes the credit-limit check. Independent collections,
supplier payments and allocation endpoints remain separate pending work.
