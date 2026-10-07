import { randomUUID } from 'node:crypto';
import type { CreateSaleInput, Customer, Product, Warehouse } from '@ahmed-store/contracts';
import { calculateSale, type CalculatedSale } from './calculation.js';

export type PostedSale = {
  id: string;
  organizationId: string;
  customerId: string;
  warehouseId: string;
  subtotal: string;
  discount: string;
  total: string;
  occurredAt: Date;
};

export type PostSaleCommand = {
  id: string;
  organizationId: string;
  actorUserId: string;
  idempotencyKey: string;
  input: CreateSaleInput;
  calculated: CalculatedSale;
  products: Map<string, Product>;
};

export interface SalesRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<PostedSale | null>;
  findCustomer(id: string, organizationId: string): Promise<Customer | null>;
  findWarehouse(id: string, organizationId: string): Promise<Warehouse | null>;
  findProducts(ids: string[], organizationId: string): Promise<Product[]>;
  post(command: PostSaleCommand): Promise<{ ok: true; sale: PostedSale } | { ok: false; reason: 'INSUFFICIENT_STOCK' }>;
}

export type PostSaleResult =
  | { ok: true; sale: PostedSale; replayed: boolean }
  | { ok: false; reason: 'CUSTOMER_UNAVAILABLE' | 'WAREHOUSE_UNAVAILABLE' | 'PRODUCT_UNAVAILABLE' | 'LINE_DISCOUNT_EXCEEDS_SUBTOTAL' | 'PAYMENT_TOTAL_MISMATCH' | 'INSUFFICIENT_STOCK' };

export function createSalesService(repository: SalesRepository) {
  return {
    async post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateSaleInput): Promise<PostSaleResult> {
      const existing = await repository.findByIdempotencyKey(organizationId, idempotencyKey);
      if (existing) return { ok: true, sale: existing, replayed: true };
      const customer = await repository.findCustomer(input.customerId, organizationId);
      if (!customer || !customer.active) return { ok: false, reason: 'CUSTOMER_UNAVAILABLE' };
      const warehouse = await repository.findWarehouse(input.warehouseId, organizationId);
      if (!warehouse || !warehouse.active) return { ok: false, reason: 'WAREHOUSE_UNAVAILABLE' };
      const products = await repository.findProducts([...new Set(input.lines.map((line) => line.productId))], organizationId);
      if (products.length !== new Set(input.lines.map((line) => line.productId)).size || products.some((product) => !product.active)) return { ok: false, reason: 'PRODUCT_UNAVAILABLE' };
      const calculated = calculateSale(input);
      if (!calculated.ok) return calculated;
      const posted = await repository.post({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, input, calculated: calculated.sale, products: new Map(products.map((product) => [product.id, product])) });
      return posted.ok ? { ok: true, sale: posted.sale, replayed: false } : posted;
    }
  };
}
