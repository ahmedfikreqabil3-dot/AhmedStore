# API contract baseline

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
