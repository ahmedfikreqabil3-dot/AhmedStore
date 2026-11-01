import { randomUUID } from 'node:crypto';
import type { CreateNoInvoiceReturnInput, Customer, Product, Warehouse } from '@ahmed-store/contracts';
import { calculateSale, type CalculatedSale } from './calculation.js';

export type PendingNoInvoiceReturn = { id: string; organizationId: string; total: string; status: 'PENDING_APPROVAL' };
export type ExistingNoInvoiceReturn=Omit<PendingNoInvoiceReturn,'status'>&{status:'PENDING_APPROVAL'|'POSTED'|'VOIDED'};
export type PendingNoInvoiceApproval = PendingNoInvoiceReturn & { customerId: string; warehouseId: string; actorUserId: string; reason: string; occurredAt: Date };

export interface NoInvoiceReturnsRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<ExistingNoInvoiceReturn | null>;
  findCustomer(id: string, organizationId: string): Promise<Customer | null>;
  findWarehouse(id: string, organizationId: string): Promise<Warehouse | null>;
  findProducts(ids: string[], organizationId: string): Promise<Product[]>;
  createPending(command: { id: string; organizationId: string; actorUserId: string; idempotencyKey: string; input: CreateNoInvoiceReturnInput; total: string; calculatedLines:CalculatedSale['lines'] }): Promise<SubmitNoInvoiceReturnResult>;
}

export type SubmitNoInvoiceReturnResult =
  | { ok: true; salesReturn: ExistingNoInvoiceReturn; replayed: boolean }
  | { ok: false; reason: 'CUSTOMER_UNAVAILABLE' | 'WAREHOUSE_UNAVAILABLE' | 'PRODUCT_UNAVAILABLE' | 'PAYMENT_TOTAL_MISMATCH' | 'ACTOR_UNAVAILABLE' | 'IDEMPOTENCY_KEY_CONFLICT' };

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
      return repository.createPending({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, input, total: calculated.sale.total,calculatedLines:calculated.sale.lines });
    }
  };
}

export interface NoInvoiceApprovalRepository {
  listPending(organizationId: string): Promise<PendingNoInvoiceApproval[]>;
  findPending(id: string, organizationId: string): Promise<ExistingNoInvoiceReturn | null>;
  approve(input: { id: string; organizationId: string; financeUserId: string }): Promise<ApproveNoInvoiceReturnResult>;
}

export type ApproveNoInvoiceReturnResult =
  | { ok: true; salesReturn: { id: string; total: string } }
  | { ok: false; reason: 'RETURN_NOT_PENDING' | 'CUSTOMER_UNAVAILABLE' | 'WAREHOUSE_UNAVAILABLE' | 'PRODUCT_UNAVAILABLE' | 'ACTOR_UNAVAILABLE' | 'PAYMENT_TOTAL_MISMATCH' };

export function createNoInvoiceApprovalService(repository: NoInvoiceApprovalRepository) {
  return {
    async listPending(organizationId: string): Promise<PendingNoInvoiceApproval[]> {
      return repository.listPending(organizationId);
    },
    async approve(organizationId: string, financeUserId: string, returnId: string): Promise<ApproveNoInvoiceReturnResult> {
      const pending = await repository.findPending(returnId, organizationId);
      if (!pending || pending.status==='VOIDED') return { ok: false, reason: 'RETURN_NOT_PENDING' };
      return repository.approve({ id: returnId, organizationId, financeUserId });
    }
  };
}
