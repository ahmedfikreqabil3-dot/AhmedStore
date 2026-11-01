# Authorization baseline

## Current vs target — 2026-10-29 audit

The inventories below include target permissions and future scope controls.
Current grants are in apps/api/src/modules/identity/authorization.ts and enforced
in app.ts. A target permission is not proof of a live route, admin UI or
warehouse-scoped grant. Legacy exceptions and warehouse cutover scope remain
B16/F17 decisions; adding screens does not authorize widening existing access.

## Legacy roles observed

| Role | Legacy access |
| --- | --- |
| Admin | All pages; can manage users, edit price, apply discount, and delete sales. |
| Cashier | POS, sales, customers, quotations, returns. |
| Warehouse manager | Products, inventory, suppliers, purchases, warehouses, purchase invoices, stock adjustments. |

## Production permissions

The production system uses server-enforced permission codes rather than hiding
frontend pages. Initial permissions are:

```text
users:manage       catalogue:read       catalogue:manage
customers:read     customers:manage     suppliers:manage
sales:create       sales:read           sales:void
returns:create     inventory:read       inventory:adjust
inventory:transfer purchases:manage     expenses:manage
treasury:read      treasury:manage      reports:read
settings:manage
```

Role assignments are organization-scoped. Warehouse-scoped grants will be
introduced before multi-warehouse POS cutover. The API checks both permission
and organization/warehouse scope on every route; the frontend only reflects
permissions for usability and is never the security boundary.

`FINANCE` is the dedicated approver for no-invoice returns. `ADMIN` retains
the same approval permission as an emergency/ownership override; managers can
enter a proposed valuation but cannot self-approve it. The permissions are
`returns:submit_no_invoice` for `MANAGER`/`ADMIN` and
`returns:approve_no_invoice` for `FINANCE`/`ADMIN`.

`purchases:manage` is assigned to `WAREHOUSE`, `MANAGER`, and `ADMIN`.
Finance remains intentionally separate from goods-receipt creation; later
purchase payment approval will receive a distinct finance permission.

## Security acceptance checks

The owner-approved `GET /api/v1/pos/options` endpoint requires `sales:write`
(`CASHIER`, `MANAGER`, or `ADMIN`). It derives organization scope from the
authenticated session, ignoring client organization selectors. It returns active
products with only id/name/SKU/barcode/salePrice, and active customers and
warehouses with only id/name. Purchase costs, customer phone/email/address,
notes, and credit limits are not included. It grants no inventory write access
and does not relax existing catalogue, purchasing, reporting, or user endpoints.

- Anonymous requests to protected endpoints return 401.
- Authenticated users lacking permission return 403.
- A user cannot read or mutate another organization’s data, including by UUID guessing.
- Sensitive actions create an audit event with actor, organization, entity,
  before/after summary, request id, and timestamp.
## Party lifecycle controls — 2026-10-30

Customer archive/reactivate and archived-directory access use the existing
combination of `inventory:write` and `sales:write` (Admin/Manager). Supplier
equivalents use `inventory:write` and `purchases:manage` (Admin/Manager/Warehouse).
Cashier can continue existing active customer reads/create and statement access,
but cannot archive or read the administration directory. Finance retains report/
statement access and does not receive party-administration grants through this
change. Every write rechecks an active actor in the same tenant inside its
serializable transaction, validates the expected version, and records the reason.

Customer archival is blocked by either a positive or negative account balance,
or a pending return. Supplier archival is blocked by any unsettled signed payable
balance. Archived records retain historical statements and references. Future
quotation/order modules must add their open-document dependencies to these
guards when those persisted models are introduced.
