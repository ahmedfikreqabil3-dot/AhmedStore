import { randomUUID } from 'node:crypto';
import type { CreatePurchaseInput, Product, Supplier, Warehouse } from '@ahmed-store/contracts';
import { calculatePurchase, type CalculatedPurchase } from './calculation.js';

export type PostedPurchase = { id: string; organizationId: string; supplierId: string; warehouseId: string; subtotal: string; total: string; occurredAt: Date };
export type ResolvedPurchaseLine = { productId: string; barcode: string | undefined; quantity: string; unitCost: string };
export type PostPurchaseCommand = { id: string; organizationId: string; actorUserId: string; idempotencyKey: string; input: Omit<CreatePurchaseInput, 'lines'> & { lines: ResolvedPurchaseLine[] }; calculated: CalculatedPurchase; products: Map<string, Product> };

export interface PurchaseRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<PostedPurchase | null>;
  findSupplier(id: string, organizationId: string): Promise<Supplier | null>;
  findWarehouse(id: string, organizationId: string): Promise<Warehouse | null>;
  findProducts(ids: string[], organizationId: string): Promise<Product[]>;
  findProductsByBarcodes(barcodes: string[], organizationId: string): Promise<Product[]>;
  post(command: PostPurchaseCommand): Promise<PostedPurchase>;
}

export type PostPurchaseResult =
  | { ok: true; purchase: PostedPurchase; replayed: boolean }
  | { ok: false; reason: 'SUPPLIER_UNAVAILABLE' | 'WAREHOUSE_UNAVAILABLE' | 'PRODUCT_UNAVAILABLE' | 'PAYMENT_TOTAL_MISMATCH' };

function paymentUnits(amount: string) {
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
}

export function createPurchaseService(repository: PurchaseRepository) {
  return {
    async post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreatePurchaseInput): Promise<PostPurchaseResult> {
      const existing = await repository.findByIdempotencyKey(organizationId, idempotencyKey);
      if (existing) return { ok: true, purchase: existing, replayed: true };
      const supplier = await repository.findSupplier(input.supplierId, organizationId);
      if (!supplier || !supplier.active) return { ok: false, reason: 'SUPPLIER_UNAVAILABLE' };
      const warehouse = await repository.findWarehouse(input.warehouseId, organizationId);
      if (!warehouse || !warehouse.active) return { ok: false, reason: 'WAREHOUSE_UNAVAILABLE' };
      const ids = input.lines.flatMap((line) => line.productId ? [line.productId] : []);
      const barcodes = input.lines.flatMap((line) => line.barcode ? [line.barcode] : []);
      const products = [...await repository.findProducts([...new Set(ids)], organizationId), ...await repository.findProductsByBarcodes([...new Set(barcodes)], organizationId)];
      const byId = new Map(products.map((product) => [product.id, product]));
      const byBarcode = new Map(products.flatMap((product) => product.barcode ? [[product.barcode, product] as const] : []));
      const resolvedLines = input.lines.map((line) => {
        const product = line.productId ? byId.get(line.productId) : byBarcode.get(line.barcode!);
        return product && { productId: product.id, barcode: line.barcode, quantity: line.quantity, unitCost: line.unitCost };
      });
      if (resolvedLines.some((line) => !line) || resolvedLines.some((line) => !byId.get(line!.productId)?.active)) return { ok: false, reason: 'PRODUCT_UNAVAILABLE' };
      const calculated = calculatePurchase(resolvedLines as ResolvedPurchaseLine[]);
      const paid = input.payments.reduce((total, payment) => total + paymentUnits(payment.amount), 0n);
      if (paid !== paymentUnits(calculated.total)) return { ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' };
      const purchase = await repository.post({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, input: { ...input, lines: resolvedLines as ResolvedPurchaseLine[] }, calculated, products: byId });
      return { ok: true, purchase, replayed: false };
    }
  };
}
