# Phase 4 — purchasing workflow UI

## Objective

Complete the React purchasing workflows without allowing users to enter opaque
purchase or purchase-line identifiers. The UI must consume organization-scoped,
posted purchase documents and preserve the existing backend's immutable
revision, return, stock, supplier-ledger, treasury, and audit controls.

## Current evidence

- `POST /api/v1/purchases` supports barcode or product-ID lines and validates
  payment totals atomically.
- `PUT /api/v1/purchases/:purchaseId` creates an audited void/replacement
  revision; it does not mutate a posted document.
- `POST /api/v1/purchase-returns` accepts original purchase-line IDs and split
  `SUPPLIER_CREDIT` / `TREASURY_REFUND` settlements whose exact sum must equal
  the calculated return value.
- The browser scanner now loads real authenticated products, but no purchase
  read-model endpoint exists for selecting a posted purchase and its lines.

## Delivery sequence

### 4A — purchase read model

Add authenticated `GET /api/v1/purchases` and `GET /api/v1/purchases/:id`
endpoints, restricted to `purchases:manage`.

The detail response must include only the caller's organization, posted/voided
status, supplier, branch, totals, occurrence time, and immutable line fields:
`id`, `lineNumber`, `productId`, product snapshot name/SKU/barcode, received
quantity, unit cost, and line total. It must never accept client-supplied
financial totals or returnable quantity as authoritative.

Acceptance criteria:

- Cross-organization and unauthenticated reads return no data / the appropriate
  401 or 403 response.
- Listing is bounded and deterministic.
- A voided purchase remains visible for audit but is not selectable for a new
  return or revision.
- API, service, and integration tests cover all authorization, missing,
  organization-boundary, status, and serialization paths at 100% coverage for
  modified application code.

Exit criteria: the React client can select a real posted purchase and line(s)
without manually entering identifiers.

**Implemented API foundation:** `GET /api/v1/purchases` returns a deterministic,
bounded (100-record) organization-scoped document list, and `GET
/api/v1/purchases/:purchaseId` returns the persisted immutable line snapshots.
Both endpoints require `purchases:manage`; missing documents return `404`; and
the composition layer returns `503` if the read service is not configured. The
React selector now loads these real documents and immutable line snapshots, and
does not permit selecting a voided purchase. The next step is the status-aware
return/revision editor.

### 4B — purchase entry and revision

Build a purchase editor that uses the real product scanner/catalogue, supplier
and branch selections, explicit payment allocations, and a confirmed submit.
For an edit, load the existing document, create a replacement command, and
display that the server will void/reverse the original rather than editing it
in place.

Acceptance criteria:

- Barcode scans add live catalogue products to the editor.
- The client requires a payment allocation total equal to the displayed line
  total before enabling submission; the server remains the source of truth.
- A failed request leaves the editor intact and displays no success state.
- A successful revision identifies the replacement document and refreshes the
  selected record.
- UI tests cover success, validation, server rejection, and unmount/stale-load
  behavior at 100% coverage for modified application code.

Exit criteria: a purchasing user can post and revise a purchase without bypassing
the existing backend controls.

### 4C — purchase returns and split settlements

Build a return panel from selected original lines. The panel calculates a
preview only; the backend determines the authoritative result. It must collect
the mandatory reason and one or more settlement allocations. Treasury-refund
allocations require a non-credit payment method; supplier-credit allocations do
not.

Acceptance criteria:

- Selected quantities cannot exceed the original-line quantity in the UI, while
  the server's concurrent cumulative-return check remains authoritative.
- The user can split settlement amounts between supplier credit and one or more
  treasury refunds.
- The displayed allocation total must equal the preview return total before
  submission; server rejection is surfaced without claiming a posting.
- A successful response refreshes stock and supplier/treasury views from APIs.
- Tests cover split allocation, mismatch, insufficient stock, concurrent/excess
  return rejection, authorization, and transaction failure behavior.

Exit criteria: a purchase return is selectable, auditable, and cannot create a
partial financial or inventory outcome in the UI.

## Production considerations

Before enabling this workflow in production, reconcile migrated purchase,
supplier-ledger, treasury, and inventory balances; rehearse rollback; run role
and tenant-isolation security tests; load-test the list/detail endpoints; and
restore a backup into an isolated environment.
