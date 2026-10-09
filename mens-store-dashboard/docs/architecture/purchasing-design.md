# Purchasing posting design

## Scope and decisions

This design covers suppliers, posted purchase invoices, controlled purchase
revisions, and purchase returns. It does not change legacy screens until the
React replacement has passed acceptance and reconciliation.

- A purchase invoice is an immutable posted document. Editing a posted invoice
  voids the original through compensating movements and posts a linked
  replacement; it never overwrites original lines, payments, or totals.
- A revision is rejected after a posted purchase return, and it is rejected if
  the original receipt can no longer be removed from stock. When valid, one
  serializable transaction voids the original, posts its inventory and
  settlement reversals, creates a linked replacement, and posts the new
  inventory and settlement entries.
- Barcode scanning is a frontend convenience. The server still receives a
  product UUID and verifies that the product belongs to the organization and
  is active. The barcode snapshot on each purchase line preserves what was
  scanned at posting time.
- Every paid non-credit line creates a `PURCHASE_PAYMENT` treasury outflow.
  Credit lines create a `PURCHASE_CREDIT` supplier-ledger entry. Supplier
  payable balance is derived from its immutable ledger, not stored on
  `Supplier`.
- A purchase return references original purchase lines. It cannot exceed the
  quantity received minus previously posted returns, and it only posts when
  the selected warehouse has sufficient stock to remove.
- A credit-funded return posts `PURCHASE_RETURN_CREDIT` to reduce the payable.
  Every purchase return explicitly supplies one or more settlement allocations:
  supplier credit and/or cash/card/wallet/Instapay treasury refunds. Their exact
  four-decimal total must equal the calculated return value. The API persists
  each allocation, posts its matching supplier-ledger reduction or treasury
  receipt, and never infers settlement from the original payment mix.

## Acceptance criteria for the API slice

1. Supplier and purchase requests are tenant scoped and require
   `purchases:manage`.
2. A purchase posting atomically creates its document, immutable line/payment
   snapshots, positive `PURCHASE_RECEIPT` inventory movements, paid treasury
   outflows, credit supplier-ledger entries, and an audit event.
3. Repeating a command with the same idempotency key returns the original
   document without duplicate stock, cash, or supplier entries.
4. Purchase replacement posts compensating entries for the original and a
   linked replacement in one serializable transaction.
5. Purchase return failures leave no partial document, stock, treasury, or
   supplier-ledger records.
6. Split settlement allocations are persisted with the return and the return,
   inventory issue, treasury receipts, supplier credit, and audit event use one
   serializable database transaction.
