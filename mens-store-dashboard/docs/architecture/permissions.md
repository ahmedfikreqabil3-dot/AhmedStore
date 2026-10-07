# Authorization baseline

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

## Security acceptance checks

- Anonymous requests to protected endpoints return 401.
- Authenticated users lacking permission return 403.
- A user cannot read or mutate another organization’s data, including by UUID guessing.
- Sensitive actions create an audit event with actor, organization, entity,
  before/after summary, request id, and timestamp.
