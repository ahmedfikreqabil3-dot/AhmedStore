import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApplicationServices } from '../../src/services.js';
import { hashSessionToken } from '../../src/modules/identity/session.js';

if (!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1))) throw Error('Separate test database required');
const prisma = new PrismaClient();
const services = createApplicationServices(prisma);
let organizationId: string, otherId: string, actorId: string;
const at = new Date('2026-10-01T12:00:00Z');
beforeAll(async () => {
  organizationId = (await prisma.organization.create({ data: { name: 'Composition ' + randomUUID() } })).id;
  otherId = (await prisma.organization.create({ data: { name: 'Foreign composition ' + randomUUID() } })).id;
  actorId = (await prisma.user.create({ data: { organizationId, name: 'Admin', email: 'admin@example.test', passwordHash: 'unused', role: 'ADMIN' } })).id;
});
afterAll(async () => {
  const where = { organizationId: { in: [organizationId, otherId] } };
  await prisma.customerLedgerEntry.deleteMany({ where });
  await prisma.auditEvent.deleteMany({ where });
  await prisma.session.deleteMany({ where });
  await prisma.shift.deleteMany({ where });
  await prisma.treasuryTransaction.deleteMany({ where });
  await prisma.inventoryTransaction.deleteMany({ where });
  await prisma.salePayment.deleteMany({ where: { sale: where } });
  await prisma.saleLine.deleteMany({ where: { sale: where } });
  await prisma.sale.deleteMany({ where });
  await prisma.product.deleteMany({ where });
  await prisma.category.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.supplier.deleteMany({ where });
  await prisma.warehouse.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherId] } } });
  await prisma.$disconnect();
});

async function workbook(name: string, headers: string[], rows: unknown[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(name); sheet.addRow(headers); rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

it('composes registration, scoped login, token persistence and revocation without exposing password hashes', async () => {
  const input = { organizationId, name: 'Composed user', email: 'composed@example.test', password: 'SecurePassword123!', role: 'CASHIER' as const };
  const registration = await services.identityService.register(input);
  expect(registration.ok).toBe(true); if (!registration.ok) throw Error(registration.reason);
  expect(registration.user).not.toHaveProperty('passwordHash'); expect(registration.user).not.toHaveProperty('active');
  await services.identityService.auditUserCreated(actorId, registration.user);
  expect(await services.identityService.register(input)).toEqual({ ok: false, reason: 'EMAIL_TAKEN' });
  expect(await services.authenticationService.login({ ...input, organizationId: otherId })).toEqual({ ok: false, reason: 'INVALID_CREDENTIALS' });
  const login = await services.authenticationService.login(input); expect(login.ok).toBe(true); if (!login.ok) throw Error(login.reason);
  const stored = await prisma.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(login.token) } });
  expect(stored.tokenHash).not.toBe(login.token);
  expect(await services.authenticationService.authenticate(login.token)).toMatchObject({ ok: true, user: { id: registration.user.id } });
  await services.authenticationService.logout(login.token);
  expect(await services.authenticationService.authenticate(login.token)).toEqual({ ok: false, reason: 'UNAUTHENTICATED' });
  const directory = await services.userDirectoryService.list(organizationId);
  expect(directory.map(user => user.id)).toEqual(expect.arrayContaining([actorId, registration.user.id]));
  for (const user of directory) { expect(user).not.toHaveProperty('passwordHash'); expect(user).not.toHaveProperty('active'); }
  expect(await services.userDirectoryService.list(otherId)).toEqual([]);
  expect(await prisma.auditEvent.count({ where: { organizationId, action: { in: ['USER_CREATED', 'AUTH_LOGIN', 'AUTH_LOGOUT'] } } })).toBe(3);
});

it('scopes catalogue reads and rejects duplicate identifiers and foreign or archived categories', async () => {
  const category = await services.categoryService.create(organizationId, { name: 'Composition category' });
  if (!category.ok) throw Error(category.reason);
  expect(await services.categoryService.create(organizationId, { name: category.category.name })).toEqual({ ok: false, reason: 'CATEGORY_EXISTS' });
  const input = { name: 'Composition shirt', sku: 'COMPOSE-SHIRT', barcode: '1234567890123', categoryId: category.category.id, salePrice: '19.9500', costPrice: '5.1234' };
  expect(await services.productService.create(otherId, input)).toEqual({ ok: false, reason: 'CATEGORY_UNAVAILABLE' });
  const product = await services.productService.create(organizationId, input); expect(product).toMatchObject({ ok: true, product: { salePrice: '19.9500', costPrice: '5.1234' } });
  expect(await services.productService.create(organizationId, input)).toEqual({ ok: false, reason: 'SKU_EXISTS' });
  expect(await services.productService.create(organizationId, { ...input, sku: 'DIFFERENT' })).toEqual({ ok: false, reason: 'BARCODE_EXISTS' });
  expect(await services.categoryService.archive(category.category.id, otherId)).toBeNull();
  expect(await services.categoryService.archive(category.category.id, organizationId)).toMatchObject({ archivedAt: expect.any(Date) });
  expect(await services.categoryService.archive(category.category.id, organizationId)).toBeNull();
  expect(await services.categoryService.list(organizationId)).not.toContainEqual(expect.objectContaining({ id: category.category.id }));
  expect(await services.productService.create(organizationId, { ...input, sku: 'ARCHIVED', barcode: null })).toEqual({ ok: false, reason: 'CATEGORY_UNAVAILABLE' });
  expect(await services.productService.create(organizationId, { ...input, sku: 'NO-CATEGORY', barcode: null, categoryId: null })).toMatchObject({ ok: true });
  expect(await services.productService.list(organizationId)).toContainEqual(expect.objectContaining({ sku: input.sku, salePrice: '19.9500' }));
  expect(await services.productService.list(otherId)).toEqual([]);
});

it('scopes active parties, warehouses and exact stock balances by time and optional warehouse', async () => {
  const party = { name: 'Composition party', phone: null, email: null, address: null, notes: null };
  const customer = await services.customerService.create(organizationId, { ...party, creditLimit: '0' });
  const supplier = await services.supplierService.create(organizationId, party);
  expect(customer.customer.creditLimit).toBe('0.0000');
  expect(await services.customerService.list(otherId)).toEqual([]); expect(await services.supplierService.list(otherId)).toEqual([]);
  expect(await services.customerService.list(organizationId)).toContainEqual(expect.objectContaining({ id: customer.customer.id }));
  expect(await services.supplierService.list(organizationId)).toContainEqual(expect.objectContaining({ id: supplier.supplier.id }));
  await prisma.customer.update({ where: { id: customer.customer.id }, data: { active: false } });
  await prisma.supplier.update({ where: { id: supplier.supplier.id }, data: { active: false } });
  expect(await services.customerService.list(organizationId)).not.toContainEqual(expect.objectContaining({ id: customer.customer.id }));
  expect(await services.supplierService.list(organizationId)).not.toContainEqual(expect.objectContaining({ id: supplier.supplier.id }));
  const period={from:at,to:at,limit:25,offset:0};
  expect(await services.customerService.statement(organizationId,customer.customer.id,period)).toMatchObject({kind:'customers',closing:'0.0000'});
  expect(await services.supplierService.statement(organizationId,supplier.supplier.id,period)).toMatchObject({kind:'suppliers',closing:'0.0000'});
  const first = await services.warehouseService.create(organizationId, { name: 'Composition first' });
  const second = await services.warehouseService.create(organizationId, { name: 'Composition second' });
  if (!first.ok || !second.ok) throw Error('warehouse fixture');
  expect(await services.warehouseService.create(organizationId, { name: first.warehouse.name })).toEqual({ ok: false, reason: 'WAREHOUSE_EXISTS' });
  expect(await services.warehouseService.list(otherId)).toEqual([]);
  expect(await services.warehouseService.list(organizationId)).toHaveLength(2);
  const product = await prisma.product.create({ data: { organizationId, name: 'Stock precision', sku: randomUUID(), salePrice: '1', costPrice: '1' } });
  const read = (warehouse?: string) => services.stockService.quantityAsOf(organizationId, product.id, at, warehouse);
  expect(await read()).toBe('0.0000');
  for (const [warehouseId, quantity, occurredAt] of [[first.warehouse.id, '2.3456', at], [second.warehouse.id, '1.0001', at], [first.warehouse.id, '99', new Date(at.getTime() + 1)]] as const) await prisma.inventoryTransaction.create({ data: { organizationId, productId: product.id, warehouseId, quantity, occurredAt, type: 'OPENING_BALANCE', referenceType: 'Test', referenceId: randomUUID() } });
  expect(await read()).toBe('3.3457'); expect(await read(first.warehouse.id)).toBe('2.3456');
  expect(await services.stockService.quantityAsOf(otherId, product.id, at)).toBe('0.0000');
});

it('commits audited category and supplier imports once and reports existing names', async () => {
  const categoryFile = await workbook('Categories', ['Name'], [['Imported composition']]);
  expect(await services.categoryImportService.import(organizationId, actorId, categoryFile)).toEqual({ ok: true, imported: 1 });
  expect(await services.categoryImportService.import(organizationId, actorId, categoryFile)).toMatchObject({ ok: false, preview: { errors: [{ message: 'CATEGORY_EXISTS' }] } });
  const supplierFile = await workbook('Suppliers', ['Name', 'Phone', 'Email', 'Address', 'Notes'], [['Imported supplier', '', '', '', '']]);
  expect(await services.supplierImportService.import(organizationId, actorId, supplierFile)).toEqual({ ok: true, imported: 1 });
  expect(await services.supplierImportService.import(organizationId, actorId, supplierFile)).toMatchObject({ ok: false, preview: { errors: [{ message: 'SUPPLIER_EXISTS' }] } });
  expect(await prisma.auditEvent.count({ where: { organizationId, action: { in: ['CATEGORIES_IMPORTED', 'SUPPLIERS_IMPORTED'] } } })).toBe(2);
});

it('resolves import categories and detects existing products both with and without barcodes', async () => {
  const file = await workbook('Products', ['Name', 'SKU', 'Barcode', 'Category', 'Sale Price', 'Cost Price'], [['Imported shirt', 'IMPORTED-1', '9999999999999', 'Imported composition', '15.5001', '1.1234'], ['Imported plain', 'IMPORTED-2', '', '', '2', '1']]);
  expect(await services.productImportService.import(organizationId, actorId, file)).toEqual({ ok: true, imported: 2 });
  expect(await services.productImportService.import(organizationId, actorId, file)).toMatchObject({ ok: false });
  const products = await prisma.product.findMany({ where: { organizationId, sku: { in: ['IMPORTED-1', 'IMPORTED-2'] } } });
  expect(products).toHaveLength(2); expect(products.find(row => row.sku === 'IMPORTED-1')!.costPrice.toFixed(4)).toBe('1.1234');
  expect(products.find(row => row.sku === 'IMPORTED-2')!.categoryId).toBeNull();
  expect(await prisma.auditEvent.count({ where: { organizationId, action: 'PRODUCTS_IMPORTED' } })).toBe(1);
});

it('rolls import batches back when their audit actor is missing', async () => {
  const categoryFile = await workbook('Categories', ['Name'], [['Rolled back category']]);
  await expect(services.categoryImportService.import(organizationId, randomUUID(), categoryFile)).rejects.toMatchObject({ code: 'P2003' });
  expect(await prisma.category.count({ where: { organizationId, name: 'Rolled back category' } })).toBe(0);
  const supplierFile = await workbook('Suppliers', ['Name', 'Phone', 'Email', 'Address', 'Notes'], [['Rolled back supplier', '', '', '', '']]);
  await expect(services.supplierImportService.import(organizationId, randomUUID(), supplierFile)).rejects.toMatchObject({ code: 'P2003' });
  expect(await prisma.supplier.count({ where: { organizationId, name: 'Rolled back supplier' } })).toBe(0);
  const productFile = await workbook('Products', ['Name', 'SKU', 'Barcode', 'Category', 'Sale Price', 'Cost Price'], [['Rolled back shirt', 'ROLLBACK-SKU', '', '', '15', '1']]);
  await expect(services.productImportService.import(organizationId, randomUUID(), productFile)).rejects.toMatchObject({ code: 'P2003' });
  expect(await prisma.product.count({ where: { organizationId, sku: 'ROLLBACK-SKU' } })).toBe(0);
});

it('composes paginated historical snapshots, filters and audited exports from the real sale adapter', async () => {
  const customer = await prisma.customer.create({ data: { organizationId, name: 'Historical customer' } });
  const warehouse = await prisma.warehouse.create({ data: { organizationId, name: 'Historical branch' } });
  const product = await prisma.product.create({ data: { organizationId, name: 'Immutable name', sku: 'HISTORY', salePrice: '19.95', costPrice: '5' } });
  await prisma.inventoryTransaction.create({ data: { organizationId, productId: product.id, warehouseId: warehouse.id, quantity: '10', occurredAt: new Date(at.getTime() - 1000), type: 'OPENING_BALANCE', referenceType: 'Test', referenceId: randomUUID() } });
  expect(await services.salesService.post(organizationId, actorId, randomUUID(), { customerId: customer.id, warehouseId: warehouse.id, occurredAt: at, lines: [{ productId: product.id, quantity: '1', unitPrice: '19.95', discount: '0' }], payments: [{ method: 'CASH', amount: '19.95' }] })).toMatchObject({ ok: true });
  await prisma.product.update({ where: { id: product.id }, data: { name: 'Renamed later' } });
  const query = { from: at, to: at, warehouseId: warehouse.id, customerId: customer.id, limit: 10, offset: 0 };
  expect(await services.salesHistoryService.list(organizationId, query)).toMatchObject({ total: 1, sales: [{ total: '19.9500', customerName: 'Historical customer' }] });
  expect(await services.salesHistoryService.list(otherId, query)).toMatchObject({ total: 0, sales: [] });
  expect(await services.salesHistoryService.list(organizationId, { ...query, offset: 1 })).toMatchObject({ total: 1, sales: [] });
  const csv = await services.salesExportService.exportCsv(organizationId, actorId, query);
  expect(csv).toContain('Immutable name'); expect(csv).not.toContain('Renamed later'); expect(csv).toContain('19.9500');
  expect(await prisma.auditEvent.count({ where: { organizationId, action: 'SALES_HISTORY_EXPORTED' } })).toBe(1);
});

it('forwards personal shift ownership through the application composition', async () => {
  const opened = await services.shiftService.open(organizationId, actorId, at);
  if (!opened.ok) throw Error(opened.reason);
  const end = new Date(at.getTime() + 1000);
  const otherUser = await prisma.user.create({ data: { organizationId, name: 'Other cashier', email: 'other@example.test', role: 'CASHIER', passwordHash: 'unused' } });
  for (const [userId, amount] of [[actorId, '10'], [otherUser.id, '999']] as const) await prisma.treasuryTransaction.create({ data: { organizationId, actorUserId: userId, type: 'SALE_RECEIPT', paymentMethod: 'CASH', amount, occurredAt: at, sourceType: 'Test', sourceId: randomUUID() } });
  // The sale above is also owned by this actor and has the same test timestamp.
  expect(await services.shiftService.summary(organizationId, actorId, false, opened.shift.id, end)).toMatchObject({ ok: true, totals: { net: '29.9500' } });
});
