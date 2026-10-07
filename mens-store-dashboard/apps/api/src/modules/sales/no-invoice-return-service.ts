import { randomUUID } from 'node:crypto';
import type { CreateNoInvoiceReturnInput, Customer, Product, Warehouse } from '@ahmed-store/contracts';
import { calculateSale } from './calculation.js';

export type PendingNoInvoiceReturn = { id: string; organizationId: string; total: string; status: 'PENDING_APPROVAL' };

export interface NoInvoiceReturnsRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<PendingNoInvoiceReturn | null>;
  findCustomer(id: string, organizationId: string): Promise<Customer | null>;
  findWarehouse(id: string, organizationId: string): Promise<Warehouse | null>;
  findProducts(ids: string[], organizationId: string): Promise<Product[]>;
  createPending(command: { id: string; organizationId: string; actorUserId: string; idempotencyKey: string; input: CreateNoInvoiceReturnInput; total: string }): Promise<PendingNoInvoiceReturn>;
}

export type SubmitNoInvoiceReturnResult =
  | { ok: true; salesReturn: PendingNoInvoiceReturn; replayed: boolean }
  | { ok: false; reason: 'CUSTOMER_UNAVAILABLE' | 'WAREHOUSE_UNAVAILABLE' | 'PRODUCT_UNAVAILABLE' | 'PAYMENT_TOTAL_MISMATCH' };

export function createNoInvoiceReturnService(repository: NoInvoiceReturnsRepository) {
  return {
    async submit(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateNoInvoiceReturnInput): Promise<SubmitNoInvoiceReturnResult> {
      const existing = await repository.findByIdempotencyKey(organizationId, idempotencyKey);
      if (existing) return { ok: true, salesReturn: existing, replayed: true };
      const customer = await repository.findCustomer(input.customerId, organizationId);
      if (!customer || !customer.active) return { ok: false, reason: 'CUSTOMER_UNAVAILABLE' };
      const warehouse = await repository.findWarehouse(input.warehouseId, organizationId);
      if (!warehouse || !warehouse.active) return { ok: false, reason: 'WAREHOUSE_UNAVAILABLE' };
      const productIds = [...new Set(input.lines.map((line) => line.productId))];
      const products = await repository.findProducts(productIds, organizationId);
      if (products.length !== productIds.length || products.some((product) => !product.active)) return { ok: false, reason: 'PRODUCT_UNAVAILABLE' };
      const calculated = calculateSale({ customerId: input.customerId, warehouseId: input.warehouseId, lines: input.lines.map((line) => ({ ...line, discount: '0.0000' })), payments: input.payments, occurredAt: input.occurredAt });
      if (!calculated.ok) return { ok: false, reason: 'PAYMENT_TOTAL_MISMATCH' };
      const salesReturn = await repository.createPending({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, input, total: calculated.sale.total });
      return { ok: true, salesReturn, replayed: false };
    }
  };
}

export interface NoInvoiceApprovalRepository {
  findPending(id: string, organizationId: string): Promise<PendingNoInvoiceReturn | null>;
  approve(input: { id: string; organizationId: string; financeUserId: string }): Promise<{ id: string; total: string }>;
}

export type ApproveNoInvoiceReturnResult =
  | { ok: true; salesReturn: { id: string; total: string } }
  | { ok: false; reason: 'RETURN_NOT_PENDING' };

export function createNoInvoiceApprovalService(repository: NoInvoiceApprovalRepository) {
  return {
    async approve(organizationId: string, financeUserId: string, returnId: string): Promise<ApproveNoInvoiceReturnResult> {
      const pending = await repository.findPending(returnId, organizationId);
      if (!pending) return { ok: false, reason: 'RETURN_NOT_PENDING' };
      return { ok: true, salesReturn: await repository.approve({ id: returnId, organizationId, financeUserId }) };
    }
  };
}
