import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createReportsService } from '../../src/modules/reporting/reports.js';
import { reportSchema, type ReportQuery } from '@ahmed-store/contracts';
if (!/(?:^|_)tests?$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1))) throw Error('Separate test database required');
const db = new PrismaClient(), service = createReportsService(db);
const ids = { org: randomUUID(), other: randomUUID(), actor: randomUUID(), branch: randomUUID(), second: randomUUID(), customer: randomUUID(), supplier: randomUUID(), product: randomUUID() };
const at = new Date('2026-11-01T12:00:00.000Z');
const query = (kind: ReportQuery['kind']): ReportQuery => ({ kind, from: at, to: at, limit: 1, offset: 0 });
beforeAll(async () => {
  await db.organization.createMany({ data: [{ id: ids.org, name: 'Reports test' }, { id: ids.other, name: 'Foreign reports' }] });
  await db.user.create({ data: { id: ids.actor, organizationId: ids.org, name: 'Reports owner', email: 'reports@example.test', passwordHash: 'unused', role: 'ADMIN' } });
  await db.warehouse.createMany({ data: [ids.branch, ids.second].map((id, i) => ({ id, organizationId: ids.org, name: `Report branch ${i}` })) });
  await db.customer.create({ data: { id: ids.customer, organizationId: ids.org, name: 'Report customer' } });
  await db.supplier.create({ data: { id: ids.supplier, organizationId: ids.org, name: 'Report supplier' } });
  await db.product.create({ data: { id: ids.product, organizationId: ids.org, name: 'Report item', sku: 'REPORT', salePrice: '5', costPrice: '2' } });
  const base = { organizationId: ids.org, actorUserId: ids.actor, warehouseId: ids.branch, occurredAt: at };
  await db.sale.createMany({ data: [
    { ...base, customerId: ids.customer, subtotal: '100.1234', discount: '0', total: '100.1234' },
    { ...base, warehouseId: ids.second, customerId: ids.customer, subtotal: '10', discount: '0', total: '10' },
    { ...base, customerId: ids.customer, subtotal: '999', discount: '0', total: '999', status: 'VOIDED' },
    { ...base, occurredAt: new Date(at.getTime()+1), customerId: ids.customer, subtotal: '999', discount: '0', total: '999' }
  ] });
  await db.salesReturn.createMany({ data: [
    { ...base, customerId: ids.customer, total: '0.0001', reason: 'Report return' },
    { ...base, customerId: ids.customer, total: '50', reason: 'Pending', status: 'PENDING_APPROVAL' }
  ] });
  const purchase = await db.purchase.create({ data: { ...base, supplierId: ids.supplier, subtotal: '70.0001', total: '70.0001' } });
  await db.purchaseReturn.create({ data: { ...base, supplierId: ids.supplier, purchaseId: purchase.id, reason: 'Test', total: '20.0001' } });
  await db.inventoryTransaction.createMany({ data: [
    { organizationId: ids.org, warehouseId: ids.branch, productId: ids.product, type: 'OPENING_BALANCE', quantity: '5.1234', referenceType: 'Fixture', referenceId: randomUUID(), occurredAt: new Date(at.getTime()-86400000) },
    { organizationId: ids.org, warehouseId: ids.second, productId: ids.product, type: 'OPENING_BALANCE', quantity: '2', referenceType: 'Fixture', referenceId: randomUUID(), occurredAt: at }
  ] });
  await db.expense.create({ data: { organizationId: ids.org, actorUserId: ids.actor, category: 'Rent', description: 'Period rent', paymentMethod: 'CASH', amount: '4.1234', occurredAt: at, idempotencyKey: randomUUID() } });
  await db.treasuryTransaction.createMany({ data: [
    { organizationId: ids.org, actorUserId: ids.actor, type: 'SALE_RECEIPT', amount: '15.1234', paymentMethod: 'CASH', sourceType: 'Fixture', sourceId: randomUUID(), occurredAt: at },
    { organizationId: ids.org, actorUserId: ids.actor, type: 'EXPENSE_PAYMENT', amount: '4.1234', paymentMethod: 'CASH', sourceType: 'Fixture', sourceId: randomUUID(), occurredAt: at }
  ] });
  await db.customerLedgerEntry.create({ data: { organizationId: ids.org, customerId: ids.customer, actorUserId: ids.actor, type: 'SALE_CREDIT', sourceType: 'Sale', sourceId: randomUUID(), amount: '8.0001', occurredAt: new Date(at.getTime()-1) } });
  await db.supplierLedgerEntry.createMany({ data: [
    { organizationId: ids.org, supplierId: ids.supplier, actorUserId: ids.actor, type: 'PURCHASE_CREDIT', sourceType: 'Fixture', sourceId: randomUUID(), amount: '10.0001', occurredAt: at },
    { organizationId: ids.org, supplierId: ids.supplier, actorUserId: ids.actor, type: 'SUPPLIER_PAYMENT', sourceType: 'Fixture', sourceId: randomUUID(), amount: '3', occurredAt: at }
  ] });
});
afterAll(async () => {
  const where = { organizationId: { in: [ids.org, ids.other] } };
  await db.customerLedgerEntry.deleteMany({ where }); await db.supplierLedgerEntry.deleteMany({ where });
  await db.treasuryTransaction.deleteMany({ where }); await db.expense.deleteMany({ where });
  await db.inventoryTransaction.deleteMany({ where }); await db.purchaseReturn.deleteMany({ where }); await db.purchase.deleteMany({ where });
  await db.salesReturn.deleteMany({ where }); await db.sale.deleteMany({ where }); await db.product.deleteMany({ where });
  await db.customer.deleteMany({ where }); await db.supplier.deleteMany({ where }); await db.warehouse.deleteMany({ where });
  await db.user.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: [ids.org, ids.other] } } }); await db.$disconnect();
});
it.each([
  ['sales', '110.1233', 3], ['purchases', '50.0000', 2], ['expenses', '4.1234', 1], ['treasury', '11.0000', 2], ['customers', '8.0001', 1], ['suppliers', '7.0001', 1]
] as const)('computes exact scoped %s totals before pagination', async (kind, totalAmount, total) => {
  const result = await service.read(ids.org, query(kind));
  expect(reportSchema.parse(result)).toMatchObject({ total, totalAmount, rows: [expect.any(Object)], limit: 1 });
  expect(await service.read(ids.other, query(kind))).toMatchObject({ total: 0, totalAmount: '0.0000', rows: [] });
  expect((await service.read(ids.org, query(kind), true)).rows).toHaveLength(total);
});
it('applies branch filters and cumulative inventory cutoff without inventory cost estimates', async () => {
  expect(await service.read(ids.org, { ...query('sales'), warehouseId: ids.branch })).toMatchObject({ totalAmount: '100.1233', total: 2 });
  expect(await service.read(ids.org, { ...query('sales'), warehouseId: randomUUID() })).toMatchObject({ totalAmount: '0.0000', total: 0 });
  expect(await service.read(ids.org, query('inventory'))).toMatchObject({ total: 1, totalAmount: null, totalQuantity: '7.1234', rows: [{ quantity: '7.1234', label: 'Report item' }] });
  expect(await service.read(ids.org, { ...query('inventory'), warehouseId: ids.branch })).toMatchObject({ totalQuantity: '5.1234' });
  expect(await service.read(ids.other, query('inventory'))).toMatchObject({ total: 0, totalQuantity: '0.0000' });
  expect(await service.read(ids.org, { ...query('purchases'), offset: 50 })).toMatchObject({ total: 2, totalAmount: '50.0000', rows: [] });
});
