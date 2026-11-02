# Core Phase 3 / Phase 4 delivery — 2026-11-02

## Delivered core scope
- Purchase orders: immutable ordered-price snapshots, reopening, cancellation of remaining quantities, version checks and idempotent partial receipts. Only a confirmed receipt creates its linked purchase and stock/supplier/treasury postings, atomically. An order-linked purchase cannot be independently revised to bypass received quantities.
- Product/branch/category edits and archive/restore: audited, concurrency checked; archive rejects nonzero stock, open order/draft references, and categories with active products. General shop settings are versioned.
- Admin account management: roles, active status, password reset and branch assignments. Permission/password changes revoke existing sessions. Current administrators cannot remove their own administrative access or reset their own password through this workflow. Admin users retain all branches; newly created non-admin users receive no branches until assigned. Legacy users retain their existing all-branch access.
- Request-local branch filters apply to trade documents and stock reads/writes, including transactional receipt/conversion paths. Raw operational reports/thresholds use the same branch scope. Organization-global treasury/expense/shift/party statements and master administration are unavailable to accounts limited to selected branches; existing role rules still apply.

## Verified rollout
| Migration | Verified read-only backup | Historical business tables unchanged |
| --- | --- | ---: |
| `20261102002000_purchase_orders` | `ahmed_store_core_step1_20261102084808` | 37 |
| `20261102003000_core_management` | `ahmed_store_core_step2_20261102091731` | 39 |
| `20261102004000_user_branch_administration` | `ahmed_store_core_step3_20261102092948` | 39 |

The counts exclude the migration registry, new tables and newly added metadata
columns as applicable. All existing business values were compared before/after.
Application grants: PurchaseOrder SELECT/INSERT/UPDATE; OrderReceipt SELECT/INSERT;
Organization and User SELECT/UPDATE; UserBranch SELECT/INSERT/DELETE. Session UPDATE
was verified. Tenant-scoped user/warehouse links and all 30 migration checksums
were verified; no migration remains pending. The local API was restarted and seven
authenticated core read endpoints passed without financial demo writes.

## Critical verification
- 72 distinct API tests across 10 files: nine-file 68-test regression plus the final five-test trade-cycle file and three order-route tests (overlap excluded).
- 49 UI tests across seven affected files; five contracts tests across four files; final API/web TypeScript and production frontend build.
- Trade-cycle API E2E: partial receipts 2+3, held-sale conversion/replay, customer return, supplier return, exact branch stocks and debt, customer collection and supplier settlement/replay. Cash reconciles 100+20-40=80. All five roles, cross-branch document/stock denial, concurrent request isolation, no-branch access, password reset, deactivation and session revocation verified.
- Native Edge: receipt response deliberately lost then retried to one purchase; exactly two receipts/two purchases and stock five. Master edit/archive/restore, stock archive guard and settings persistence passed. Account role/branch/reset/deactivate flows passed at desktop/mobile widths.
- Browser financial writes and destructive fixture cleanup target only the isolated `ahmed_store_api_tests` database. Demo testing used authenticated reads only, aside from ordinary login/logout session/audit writes.

These critical checks do not claim a fresh full-source 100% coverage run. The
initial broad discovery stalled and was stopped; previously deferred advanced
features, physical-printer checks, final owner acceptance and production/cutover
gates remain postponed. Phases 3 and 4 are not declared fully accepted.
