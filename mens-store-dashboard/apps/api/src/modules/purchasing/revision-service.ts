import { randomUUID } from 'node:crypto';
import type { CreatePurchaseInput, Product, Supplier, Warehouse } from '@ahmed-store/contracts';
import { calculatePurchase, type CalculatedPurchase } from './calculation.js';
import type { PostedPurchase, ResolvedPurchaseLine } from './service.js';

export type RevisablePurchase = { id: string; supplierId: string; warehouseId: string; lines: Array<{ productId: string; quantity: string }>; payments: Array<{ method: CreatePurchaseInput['payments'][number]['method']; amount: string }> };
export type PurchaseRevisionCommand = { id: string; organizationId: string; actorUserId: string; idempotencyKey: string; original: RevisablePurchase; input: Omit<CreatePurchaseInput, 'lines'> & { lines: ResolvedPurchaseLine[] }; calculated: CalculatedPurchase; products: Map<string, Product> };

export interface PurchaseRevisionRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<PostedPurchase | null>;
  findPosted(id: string, organizationId: string): Promise<RevisablePurchase | null>;
  hasReturns(purchaseId: string, organizationId: string): Promise<boolean>;
  findSupplier(id: string, organizationId: string): Promise<Supplier | null>;
  findWarehouse(id: string, organizationId: string): Promise<Warehouse | null>;
  findProducts(ids: string[], organizationId: string): Promise<Product[]>;
  findProductsByBarcodes(barcodes: string[], organizationId: string): Promise<Product[]>;
  revise(command: PurchaseRevisionCommand): Promise<{ ok: true; purchase: PostedPurchase } | { ok: false; reason: 'PURCHASE_NOT_POSTED' | 'PURCHASE_HAS_RETURNS' | 'INSUFFICIENT_STOCK' | 'PAYMENT_TOTAL_MISMATCH' }>;
}

function units(value: string) { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0')); }

export type RevisePurchaseResult = { ok: true; purchase: PostedPurchase; replayed: boolean } | { ok: false; reason: 'PURCHASE_NOT_POSTED' | 'PURCHASE_HAS_RETURNS' | 'SUPPLIER_UNAVAILABLE' | 'WAREHOUSE_UNAVAILABLE' | 'PRODUCT_UNAVAILABLE' | 'PAYMENT_TOTAL_MISMATCH' | 'INSUFFICIENT_STOCK' };

export function createPurchaseRevisionService(repository: PurchaseRevisionRepository) {
  return { async revise(organizationId: string, actorUserId: string, purchaseId: string, idempotencyKey: string, input: CreatePurchaseInput): Promise<RevisePurchaseResult> {
    const existing = await repository.findByIdempotencyKey(organizationId, idempotencyKey);
    if (existing) return { ok: true, purchase: existing, replayed: true };
    const original = await repository.findPosted(purchaseId, organizationId);
    if (!original) return { ok: false, reason: 'PURCHASE_NOT_POSTED' };
    if (await repository.hasReturns(purchaseId, organizationId)) return { ok: false, reason: 'PURCHASE_HAS_RETURNS' };
    const supplier = await repository.findSupplier(input.supplierId, organizationId);
    if (!supplier || !supplier.active) return { ok: false, reason: 'SUPPLIER_UNAVAILABLE' };
    const warehouse = await repository.findWarehouse(input.warehouseId, organizationId);
    if (!warehouse || !warehouse.active) return { ok: false, reason: 'WAREHOUSE_UNAVAILABLE' };
    const ids = input.lines.flatMap((line) => line.productId ? [line.productId] : []);
    const barcodes = input.lines.flatMap((line) => line.barcode ? [line.barcode] : []);
    const products = [...await repository.findProducts([...new Set(ids)], organizationId), ...await repository.findProductsByBarcodes([...new Set(barcodes)], organizationId)];
    const byId = new Map(products.map((product) => [product.id, product]));
    const byBarcode = new Map(products.flatMap((product) => product.barcode ? [[product.barcode, product] as const] : []));
    const lines = input.lines.map((line) => { const product = line.productId ? byId.get(line.productId) : byBarcode.get(line.barcode!); return product && { productId: product.id, barcode: line.barcode, quantity: line.quantity, unitCost: line.unitCost }; });
    if (lines.some((line) => !line) || lines.some((line) => !byId.get(line!.productId)?.active)) return { ok: false, reason: 'PRODUCT_UNAVAILABLE' };
    const calculated = calculatePurchase(lines as ResolvedPurchaseLine[]);
    if (input.payments.reduce((total, payment) => total + units(payment.amount), 0n) !== units(calculated.total)) return { ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' };
    const result = await repository.revise({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, original, input: { ...input, lines: lines as ResolvedPurchaseLine[] }, calculated, products: byId });
    return result.ok ? { ok: true, purchase: result.purchase, replayed: false } : result;
  } };
}
