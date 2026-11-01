import { Prisma, type PrismaClient } from '@prisma/client';
import { expect, it, vi } from 'vitest';
import { updateProductSchema } from '@ahmed-store/contracts';
import { createProductUpdateService, type ProductUpdateTransaction } from '../../../src/modules/catalogue/product-update.js';
import { createPrismaProductUpdateRepository } from '../../../src/modules/catalogue/product-update-repository.js';

const id = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const input = { name: 'Shirt', sku: 'SH-1', barcode: '123', categoryId: id, salePrice: '10.1234', costPrice: '5', version: 1 };
const product = { ...input, id, organizationId: id, active: true };
function setup(overrides: Partial<ProductUpdateTransaction> = {}) {
  const transaction: ProductUpdateTransaction = { findProduct: vi.fn(async () => product), findBySku: vi.fn(async () => null), findByBarcode: vi.fn(async () => null), findCategory: vi.fn(async () => ({ id, organizationId: id, name: 'Shirts', archivedAt: null })), update: vi.fn(async () => ({ ...product, version: 2 })), audit: vi.fn(async () => {}), ...overrides };
  return { transaction, service: createProductUpdateService({ transaction: async (work) => work(transaction) }) };
}
it('normalizes SKU, requires a positive version, and rejects stock/ownership/status changes', () => {
  expect(updateProductSchema.parse({ ...input, sku: ' sh-1 ' }).sku).toBe('SH-1');
  for (const extra of [{ version: 0 }, { version: undefined }, { organizationId: id }, { quantity: '4' }, { active: false }]) expect(updateProductSchema.safeParse({ ...input, ...extra }).success).toBe(false);
});
it('updates only the scoped/versioned product and audits once after a successful change', async () => {
  const { transaction, service } = setup({ findBySku: async () => product, findByBarcode: async () => product });
  expect(await service.update(id, 'actor', id, input)).toEqual({ ok: true, product: { ...product, version: 2 } });
  expect(transaction.findProduct).toHaveBeenCalledWith(id, id);
  expect(transaction.update).toHaveBeenCalledWith(id, id, input);
  expect(transaction.audit).toHaveBeenCalledExactlyOnceWith(id, 'actor', id);
  expect(await setup().service.update(id, 'actor', id, { ...input, barcode: null, categoryId: null })).toMatchObject({ ok: true });
});
it('rejects stale/missing records, conflicting identifiers and missing/archived categories before auditing', async () => {
  const cases: Array<[Partial<ProductUpdateTransaction>, string]> = [
    [{ findProduct: async () => null }, 'PRODUCT_NOT_FOUND'], [{ findProduct: async () => ({ ...product, version: 2 }) }, 'VERSION_CONFLICT'],
    [{ findBySku: async () => ({ ...product, id: 'other' }) }, 'SKU_EXISTS'], [{ findByBarcode: async () => ({ ...product, id: 'other' }) }, 'BARCODE_EXISTS'],
    [{ findCategory: async () => null }, 'CATEGORY_UNAVAILABLE'], [{ findCategory: async () => ({ id, organizationId: id, name: 'Archived', archivedAt: new Date() }) }, 'CATEGORY_UNAVAILABLE'],
    [{ update: async () => null }, 'VERSION_CONFLICT']
  ];
  for (const [overrides, reason] of cases) {
    const { transaction, service } = setup(overrides);
    expect(await service.update(id, 'actor', id, input)).toEqual({ ok: false, reason });
    expect(transaction.audit).not.toHaveBeenCalled();
  }
});
it('maps uniqueness/serialization races and propagates unknown or audit failures', async () => {
  for (const [code, reason] of [['P2002', 'PRODUCT_CONFLICT'], ['P2034', 'VERSION_CONFLICT']]) {
    const error = new Prisma.PrismaClientKnownRequestError('race', { code, clientVersion: '6' });
    expect(await setup({ audit: async () => { throw error; } }).service.update(id, 'actor', id, input)).toEqual({ ok: false, reason });
  }
  for (const error of [Error('offline'), new Prisma.PrismaClientKnownRequestError('other', { code: 'P2003', clientVersion: '6' })]) await expect(setup({ audit: async () => { throw error; } }).service.update(id, 'actor', id, input)).rejects.toBe(error);
});
it('uses a serializable transaction, scoped identifiers, version compare/update and precise serialization', async () => {
  const record = { ...product, salePrice: new Prisma.Decimal('10.1234'), costPrice: new Prisma.Decimal('5') };
  const database = { product: { findFirst: vi.fn(async () => record), findUnique: vi.fn(async () => record), updateMany: vi.fn(async () => ({ count: 1 })) }, category: { findFirst: vi.fn(async () => null) }, auditEvent: { create: vi.fn(async () => ({})) } };
  const transaction = vi.fn(async (work: (tx: typeof database) => Promise<unknown>) => work(database));
  const repository = createPrismaProductUpdateRepository({ $transaction: transaction } as unknown as PrismaClient);
  const result = await repository.transaction(async (tx) => {
    expect(await tx.findProduct(id, id)).toMatchObject({ salePrice: '10.1234', costPrice: '5.0000' });
    await tx.findBySku(id, 'SH-1'); await tx.findByBarcode(id, '123'); await tx.findCategory(id, id);
    expect(await tx.update(id, id, input)).toMatchObject({ id }); await tx.audit(id, id, id);
    database.product.findFirst.mockResolvedValueOnce(null as never);
    expect(await tx.findProduct(id, 'other')).toBeNull();
    database.product.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await tx.update(id, id, input)).toBeNull();
    return 42;
  });
  expect(result).toBe(42);
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  expect(database.product.updateMany).toHaveBeenCalledWith({ where: { id, organizationId: id, version: 1 }, data: { ...input, version: { increment: 1 } } });
  expect(database.product.findUnique).toHaveBeenCalledWith({ where: { organizationId_sku: { organizationId: id, sku: 'SH-1' } } });
  expect(database.product.findUnique).toHaveBeenCalledWith({ where: { organizationId_barcode: { organizationId: id, barcode: '123' } } });
  expect(database.category.findFirst).toHaveBeenCalledWith({ where: { id, organizationId: id } });
  expect(database.auditEvent.create).toHaveBeenCalledWith({ data: { organizationId: id, actorUserId: id, action: 'PRODUCT_UPDATED', entityType: 'Product', entityId: id } });
});
