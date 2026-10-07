import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { completeReturn, completeSale, createCustomer, createProduct, getSaleForReturn, listProducts, updateCustomer, updateProduct } from '../src/business.mjs';
import { runMigrations } from '../src/database.mjs';

const db = new DatabaseSync(':memory:');
runMigrations(db);
const timestamp = new Date().toISOString();
const warehouseId = randomUUID();
const userId = randomUUID();
db.prepare('INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)').run('local-store', 'Test Store', timestamp);
db.prepare('INSERT INTO warehouses (id, organization_id, name, code, active, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(warehouseId, 'local-store', 'Main', 'MAIN', timestamp);
db.prepare('INSERT INTO users (id, organization_id, username, display_name, role, active, requires_password_reset, created_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?)').run(userId, 'local-store', 'admin', 'Admin', 'admin', timestamp);

const product = createProduct(db, { name: 'قميص اختبار', sku: 'TEST-001', barcode: 'TEST001', category: 'قمصان', costPrice: 100, sellPrice: 250, minStock: 2, initialStock: 5, warehouseId }, userId);
assert.equal(listProducts(db).length, 1);
const customer = createCustomer(db, { name: 'عميل اختبار', phone: '01000000000' }, userId);

const sale = completeSale(db, {
  warehouseId,
  customerId: customer.id,
  actorId: userId,
  lines: [{ productId: product.id, quantity: 2 }],
  payments: [{ method: 'cash', amount: 500 }]
});
assert.equal(sale.total, 500);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sales').get().count, 1);
const saleForReturn = getSaleForReturn(db, sale.invoiceNumber);
assert.equal(saleForReturn.items.length, 1);
assert.equal(saleForReturn.items[0].productId, product.id);
assert.equal(db.prepare('SELECT COALESCE(SUM(quantity_change), 0) AS stock FROM inventory_transactions WHERE product_id = ?').get(product.id).stock, 3);
const updatedProduct = updateProduct(db, product.id, { name: 'قميص اختبار جديد', sku: 'TEST-001', barcode: 'TEST001', category: 'قمصان', costPrice: 100, sellPrice: 260, minStock: 2, stock: 4, warehouseId }, userId);
assert.equal(updatedProduct.sellPrice, 260);
assert.equal(db.prepare('SELECT COALESCE(SUM(quantity_change), 0) AS stock FROM inventory_transactions WHERE product_id = ?').get(product.id).stock, 4);
const updatedCustomer = updateCustomer(db, customer.id, { name: 'عميل اختبار جديد', phone: '01000000001', address: 'القاهرة', notes: 'عميل تجريبي' }, userId);
assert.equal(updatedCustomer.address, 'القاهرة');
const originalSaleItem = db.prepare('SELECT id FROM sale_items WHERE sale_id = ?').get(sale.id);
const returned = completeReturn(db, {
  saleId: sale.id,
  warehouseId,
  actorId: userId,
  lines: [{ saleItemId: originalSaleItem.id, quantity: 1 }],
  payments: [{ method: 'cash', amount: 250 }]
});
assert.equal(returned.refundTotal, 250);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM returns').get().count, 1);
assert.equal(db.prepare('SELECT COALESCE(SUM(quantity_change), 0) AS stock FROM inventory_transactions WHERE product_id = ?').get(product.id).stock, 5);
assert.throws(() => completeReturn(db, {
  saleId: sale.id, warehouseId, actorId: userId,
  lines: [{ saleItemId: originalSaleItem.id, quantity: 2 }],
  payments: [{ method: 'cash', amount: 500 }]
}), /exceeds the sold quantity/i);
assert.throws(() => completeSale(db, {
  warehouseId, actorId: userId,
  lines: [{ productId: product.id, quantity: 6 }],
  payments: [{ method: 'cash', amount: 1560 }]
}), /Insufficient stock/);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sales').get().count, 1);
assert.throws(() => completeSale(db, {
  warehouseId, actorId: userId,
  lines: [{ productId: product.id, quantity: 1 }],
  payments: [{ method: 'credit', amount: 260 }]
}), /customer is required/i);

db.close();
console.log('Business transaction tests passed.');
