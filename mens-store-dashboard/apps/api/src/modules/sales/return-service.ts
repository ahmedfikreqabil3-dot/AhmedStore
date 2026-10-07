import { randomUUID } from 'node:crypto';
import type { CreateInvoiceReturnInput } from '@ahmed-store/contracts';

type SaleLineForReturn = { id: string; productId: string; quantity: string; unitPrice: string; total: string };
export type ReturnableSale = { id: string; customerId: string; warehouseId: string; lines: SaleLineForReturn[] };
export type PostedReturn = { id: string; saleId: string; total: string };

export interface ReturnsRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<PostedReturn | null>;
  findSale(id: string, organizationId: string): Promise<ReturnableSale | null>;
  returnedQuantity(saleLineId: string, organizationId: string): Promise<string>;
  post(command: { id: string; organizationId: string; actorUserId: string; idempotencyKey: string; input: CreateInvoiceReturnInput; sale: ReturnableSale }): Promise<{ ok: true; salesReturn: PostedReturn } | { ok: false; reason: 'PAYMENT_TOTAL_MISMATCH' }>;
}

function decimalToUnits(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
}

export type PostInvoiceReturnResult =
  | { ok: true; salesReturn: PostedReturn; replayed: boolean }
  | { ok: false; reason: 'SALE_UNAVAILABLE' | 'SALE_LINE_UNAVAILABLE' | 'RETURN_QUANTITY_EXCEEDED' | 'PAYMENT_TOTAL_MISMATCH' };

export function createInvoiceReturnService(repository: ReturnsRepository) {
  return {
    async post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateInvoiceReturnInput): Promise<PostInvoiceReturnResult> {
      const existing = await repository.findByIdempotencyKey(organizationId, idempotencyKey);
      if (existing) return { ok: true, salesReturn: existing, replayed: true };
      const sale = await repository.findSale(input.saleId, organizationId);
      if (!sale) return { ok: false, reason: 'SALE_UNAVAILABLE' };
      const requestedBySaleLine = new Map<string, bigint>();
      for (const line of input.lines) requestedBySaleLine.set(line.saleLineId, (requestedBySaleLine.get(line.saleLineId) ?? 0n) + decimalToUnits(line.quantity));
      for (const [saleLineId, requested] of requestedBySaleLine) {
        const saleLine = sale.lines.find((line) => line.id === saleLineId);
        if (!saleLine) return { ok: false, reason: 'SALE_LINE_UNAVAILABLE' };
        const returned = decimalToUnits(await repository.returnedQuantity(saleLineId, organizationId));
        if (requested + returned > decimalToUnits(saleLine.quantity)) return { ok: false, reason: 'RETURN_QUANTITY_EXCEEDED' };
      }
      const posted = await repository.post({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, input, sale });
      return posted.ok ? { ok: true, salesReturn: posted.salesReturn, replayed: false } : posted;
    }
  };
}
