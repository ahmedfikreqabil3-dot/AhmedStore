import { randomUUID } from 'node:crypto';
import type { CreatePurchaseReturnInput } from '@ahmed-store/contracts';

export type ReturnablePurchase = { id: string; supplierId: string; warehouseId: string; lines: Array<{ id: string; productId: string; quantity: string; unitCost: string; total: string }> };
export type PostedPurchaseReturn = { id: string; purchaseId: string; total: string };
export interface PurchaseReturnRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<PostedPurchaseReturn | null>;
  findPurchase(id: string, organizationId: string): Promise<ReturnablePurchase | null>;
  returnedQuantity(purchaseLineId: string, organizationId: string): Promise<string>;
  post(command: { id: string; organizationId: string; actorUserId: string; idempotencyKey: string; input: CreatePurchaseReturnInput; purchase: ReturnablePurchase; calculated: { total: string; lines: Array<{ purchaseLineId: string; productId: string; quantity: string; unitCost: string; total: string }> } }): Promise<{ ok: true; purchaseReturn: PostedPurchaseReturn } | { ok: false; reason: 'INSUFFICIENT_STOCK' | 'RETURN_QUANTITY_EXCEEDED' }>;
}
function units(value: string) { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0')); }
function format(value: bigint) { return `${value / 10_000n}.${(value % 10_000n).toString().padStart(4, '0')}`; }
export function createPurchaseReturnService(repository: PurchaseReturnRepository) {
  return { async post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreatePurchaseReturnInput) {
    const existing = await repository.findByIdempotencyKey(organizationId, idempotencyKey); if (existing) return { ok: true as const, purchaseReturn: existing, replayed: true };
    const purchase = await repository.findPurchase(input.purchaseId, organizationId); if (!purchase) return { ok: false as const, reason: 'PURCHASE_UNAVAILABLE' as const };
    const requested = new Map<string, bigint>(); for (const line of input.lines) requested.set(line.purchaseLineId, (requested.get(line.purchaseLineId) ?? 0n) + units(line.quantity));
    for (const [lineId, quantity] of requested) { const line = purchase.lines.find((candidate) => candidate.id === lineId); if (!line) return { ok: false as const, reason: 'PURCHASE_LINE_UNAVAILABLE' as const }; if (quantity + units(await repository.returnedQuantity(lineId, organizationId)) > units(line.quantity)) return { ok: false as const, reason: 'RETURN_QUANTITY_EXCEEDED' as const }; }
    let total = 0n; const lines = input.lines.map((inputLine) => { const line = purchase.lines.find((candidate) => candidate.id === inputLine.purchaseLineId)!; const lineTotal = units(line.total) * units(inputLine.quantity) / units(line.quantity); total += lineTotal; return { purchaseLineId: line.id, productId: line.productId, quantity: inputLine.quantity, unitCost: line.unitCost, total: format(lineTotal) }; });
    if (input.settlements.reduce((sum, settlement) => sum + units(settlement.amount), 0n) !== total) return { ok: false as const, reason: 'SETTLEMENT_TOTAL_MISMATCH' as const };
    const result = await repository.post({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, input, purchase, calculated: { total: format(total), lines } });
    return result.ok ? { ok: true as const, purchaseReturn: result.purchaseReturn, replayed: false } : result;
  } };
}
