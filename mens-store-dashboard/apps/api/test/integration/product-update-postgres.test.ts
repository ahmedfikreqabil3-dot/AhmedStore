import { randomUUID } from 'node:crypto';
import { PrismaClient, type Product as ProductRecord } from '@prisma/client';
import type { UpdateProductInput } from '@ahmed-store/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createProductUpdateService } from '../../src/modules/catalogue/product-update.js';
import { createPrismaProductUpdateRepository } from '../../src/modules/catalogue/product-update-repository.js';

// Never run these write/rollback fixtures against the operational demo database.
const databaseName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!/(?:^|_)tests?$/.test(databaseName)) throw Error('A separate test database is required');
const prisma = new PrismaClient();
const service = createProductUpdateService(createPrismaProductUpdateRepository(prisma));
const organizations: string[] = [];
let organizationId: string;
let otherId: string;
let actorId: string;

beforeAll(async () => {
  for (const name of ['Product update tests', 'Other product update tests']) organizations.push((await prisma.organization.create({ data: { name: `${name} ${randomUUID()}` } })).id);
  [organizationId, otherId] = organizations;
});
beforeEach(async () => {
  actorId = (await prisma.user.create({ data: { organizationId, name: 'Test editor', email: `${randomUUID()}@example.test`, passwordHash: 'unused-test-hash', role: 'ADMIN' } })).id;
});
afterEach(async () => {
  const scope = { organizationId: { in: organizations } };
  await prisma.auditEvent.deleteMany({ where: scope });
  await prisma.inventoryTransaction.deleteMany({ where: scope });
  await prisma.saleLine.deleteMany({ where: { sale: scope } });
  await prisma.sale.deleteMany({ where: scope });
  await prisma.product.deleteMany({ where: scope });
  await prisma.category.deleteMany({ where: scope });
  await prisma.customer.deleteMany({ where: scope });
  await prisma.warehouse.deleteMany({ where: scope });
  await prisma.user.deleteMany({ where: scope });
});
afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
  await prisma.$disconnect();
});
function createProduct(owner = organizationId) {
  return prisma.product.create({ data: { organizationId: owner, name: 'Original shirt', sku: `SH-${randomUUID()}`, barcode: randomUUID(), salePrice: '10.0010', costPrice: '5.0001' } });
}
function command(product: ProductRecord): UpdateProductInput {
  return { name: 'Updated shirt', sku: product.sku, barcode: product.barcode, categoryId: null, salePrice: '20.1234', costPrice: '10.4321', version: product.version };
}

it('persists exact prices/version/audit together and leaves stock and historical invoice snapshots unchanged', async () => {
  const product = await createProduct();
  const category = await prisma.category.create({ data: { organizationId, name: 'Shirts' } });
  const warehouse = await prisma.warehouse.create({ data: { organizationId, name: 'Test branch' } });
  const customer = await prisma.customer.create({ data: { organizationId, name: 'Test customer' } });
  const movement = await prisma.inventoryTransaction.create({ data: { organizationId, warehouseId: warehouse.id, productId: product.id, type: 'OPENING_BALANCE', quantity: '7.0000', referenceType: 'TEST', referenceId: product.id, occurredAt: new Date() } });
  const sale = await prisma.sale.create({ data: { organizationId, customerId: customer.id, warehouseId: warehouse.id, actorUserId: actorId, subtotal: '10.0010', discount: '0', total: '10.0010', occurredAt: new Date(), lines: { create: { lineNumber: 1, productId: product.id, productName: product.name, sku: product.sku, quantity: '1', unitPrice: '10.0010', discount: '0', total: '10.0010' } } }, include: { lines: true } });
  const result = await service.update(organizationId, actorId, product.id, { ...command(product), sku: 'UPDATED-SHIRT', categoryId: category.id });
  expect(result).toMatchObject({ ok: true, product: { name: 'Updated shirt', sku: 'UPDATED-SHIRT', salePrice: '20.1234', costPrice: '10.4321', version: 2 } });
  const audits = await prisma.auditEvent.findMany({ where: { organizationId, entityId: product.id } });
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({ actorUserId: actorId, action: 'PRODUCT_UPDATED', entityType: 'Product' });
  expect(await prisma.inventoryTransaction.findUnique({ where: { id: movement.id } })).toEqual(movement);
  expect(await prisma.inventoryTransaction.count({ where: { organizationId } })).toBe(1);
  expect(await prisma.saleLine.findUnique({ where: { id: sale.lines[0].id } })).toEqual(sale.lines[0]);
});

it('rejects foreign records/categories, archived categories and duplicate identifiers without partial writes', async () => {
  const product = await createProduct();
  const duplicate = await createProduct();
  const foreignProduct = await createProduct(otherId);
  const foreignCategory = await prisma.category.create({ data: { organizationId: otherId, name: 'Foreign' } });
  const archived = await prisma.category.create({ data: { organizationId, name: 'Archived', archivedAt: new Date() } });
  expect(await service.update(organizationId, actorId, foreignProduct.id, command(foreignProduct))).toEqual({ ok: false, reason: 'PRODUCT_NOT_FOUND' });
  for (const categoryId of [foreignCategory.id, archived.id]) expect(await service.update(organizationId, actorId, product.id, { ...command(product), categoryId })).toEqual({ ok: false, reason: 'CATEGORY_UNAVAILABLE' });
  expect(await service.update(organizationId, actorId, product.id, { ...command(product), sku: duplicate.sku })).toEqual({ ok: false, reason: 'SKU_EXISTS' });
  expect(await service.update(organizationId, actorId, product.id, { ...command(product), barcode: duplicate.barcode })).toEqual({ ok: false, reason: 'BARCODE_EXISTS' });
  expect(await prisma.product.findUnique({ where: { id: product.id } })).toEqual(product);
  expect(await prisma.product.findUnique({ where: { id: foreignProduct.id } })).toEqual(foreignProduct);
  expect(await prisma.auditEvent.count({ where: { organizationId } })).toBe(0);
});

it('allows identifiers from another organization without reading/updating that organization', async () => {
  const product = await createProduct(); const foreign = await createProduct(otherId);
  expect(await service.update(organizationId, actorId, product.id, { ...command(product), sku: foreign.sku, barcode: foreign.barcode })).toMatchObject({ ok: true });
  expect(await prisma.product.findUnique({ where: { id: foreign.id } })).toEqual(foreign);
  expect(await prisma.auditEvent.count({ where: { organizationId: otherId } })).toBe(0);
});

it('allows only one of two simultaneous writes using the same version and rejects a stale replay', async () => {
  const product = await createProduct();
  const results = await Promise.all(['First edit', 'Second edit'].map((name) => service.update(organizationId, actorId, product.id, { ...command(product), name })));
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: 'VERSION_CONFLICT' }]);
  const saved = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(saved.version).toBe(2); expect(['First edit', 'Second edit']).toContain(saved.name);
  expect(await service.update(organizationId, actorId, product.id, command(product))).toEqual({ ok: false, reason: 'VERSION_CONFLICT' });
  expect(await prisma.auditEvent.count({ where: { organizationId, entityId: product.id } })).toBe(1);
});

it('rolls back the product change and version when the audit insert fails', async () => {
  const product = await createProduct();
  await expect(service.update(organizationId, randomUUID(), product.id, command(product))).rejects.toMatchObject({ code: 'P2003' });
  expect(await prisma.product.findUnique({ where: { id: product.id } })).toEqual(product);
  expect(await prisma.auditEvent.count({ where: { organizationId } })).toBe(0);
});
