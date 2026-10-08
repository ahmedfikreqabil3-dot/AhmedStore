import { randomUUID } from 'node:crypto';
import type { CreateInvoiceReturnInput } from '@ahmed-store/contracts';
import { calculateInvoiceReturn, type CalculatedReturn } from './return-calculation.js';
import type { PostedReturn, ReturnableSale } from './return-service.js';

export type RevisableReturn = { id: string; saleId: string; lines: Array<{ saleLineId: string; quantity: string }> };

export interface ReturnRevisionRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<PostedReturn | null>;
  findPosted(id: string, organizationId: string): Promise<RevisableReturn | null>;
  findSale(id: string, organizationId: string): Promise<ReturnableSale | null>;
  returnedQuantity(saleLineId: string, organizationId: string, excludingReturnId: string): Promise<string>;
  revise(command: { id: string; organizationId: string; actorUserId: string; idempotencyKey: string; original: RevisableReturn; input: CreateInvoiceReturnInput; sale: ReturnableSale; calculated: CalculatedReturn }): Promise<{ ok: true; salesReturn: PostedReturn } | { ok: false; reason: 'RETURN_NOT_POSTED' | 'PAYMENT_TOTAL_MISMATCH' | 'RETURN_QUANTITY_EXCEEDED' }>;
}

function decimalToUnits(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
}

export type ReviseInvoiceReturnResult =
  | { ok: true; salesReturn: PostedReturn; replayed: boolean }
  | { ok: false; reason: 'RETURN_NOT_POSTED' | 'SALE_UNAVAILABLE' | 'SALE_LINE_UNAVAILABLE' | 'RETURN_QUANTITY_EXCEEDED' | 'PAYMENT_TOTAL_MISMATCH' };

export function createReturnRevisionService(repository: ReturnRevisionRepository) {
  return {
    async revise(organizationId: string, actorUserId: string, returnId: string, idempotencyKey: string, input: CreateInvoiceReturnInput): Promise<ReviseInvoiceReturnResult> {
      const existing = await repository.findByIdempotencyKey(organizationId, idempotencyKey);
      if (existing) return { ok: true, salesReturn: existing, replayed: true };
      const original = await repository.findPosted(returnId, organizationId);
      if (!original) return { ok: false, reason: 'RETURN_NOT_POSTED' };
      if (original.saleId !== input.saleId) return { ok: false, reason: 'SALE_UNAVAILABLE' };
      const sale = await repository.findSale(input.saleId, organizationId);
      if (!sale) return { ok: false, reason: 'SALE_UNAVAILABLE' };
      const requestedBySaleLine = new Map<string, bigint>();
      for (const line of input.lines) requestedBySaleLine.set(line.saleLineId, (requestedBySaleLine.get(line.saleLineId) ?? 0n) + decimalToUnits(line.quantity));
      for (const [saleLineId, requested] of requestedBySaleLine) {
        const saleLine = sale.lines.find((line) => line.id === saleLineId);
        if (!saleLine) return { ok: false, reason: 'SALE_LINE_UNAVAILABLE' };
        if (requested + decimalToUnits(await repository.returnedQuantity(saleLineId, organizationId, original.id)) > decimalToUnits(saleLine.quantity)) return { ok: false, reason: 'RETURN_QUANTITY_EXCEEDED' };
      }
      const posted = await repository.revise({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, original, input, sale, calculated: calculateInvoiceReturn(sale, input) });
      return posted.ok ? { ok: true, salesReturn: posted.salesReturn, replayed: false } : posted;
    }
  };
}
