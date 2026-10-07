import { randomUUID } from 'node:crypto';

const organizationId = 'local-store';
const paymentMethods = new Set(['cash', 'card', 'wallet', 'instapay', 'credit']);

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function asText(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw invalid(`${field} is required.`);
  return text;
}

function asAmount(value, field, { minimum = 0 } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < minimum) throw invalid(`${field} is invalid.`);
  return amount;
}

function now() { return new Date().toISOString(); }

function defaultWarehouseId(db) {
  const row = db.prepare('SELECT id FROM warehouses WHERE organization_id = ? AND active = 1 ORDER BY created_at LIMIT 1').get(organizationId);
  if (!row) throw invalid('No active warehouse is configured.');
  return row.id;
}

function actorId(db, requestedId) {
  if (requestedId) {
    const requested = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(requestedId);
    if (requested) return requested.id;
  }
  return db.prepare("SELECT id FROM users WHERE organization_id = ? AND active = 1 ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at LIMIT 1").get(organizationId)?.id ?? null;
}

function audit(db, actor, action, entityType, entityId, details) {
  db.prepare('INSERT INTO audit_logs (id, organization_id, actor_id, action, entity_type, entity_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), organizationId, actor, action, entityType, entityId, JSON.stringify(details), now());
}

export function listProducts(db, query = '') {
  const term = String(query).trim();
  const sql = `SELECT p.id, p.legacy_id AS legacyId, p.sku, p.barcode, p.name, p.cost_price AS costPrice,
      p.sell_price AS sellPrice, p.min_stock AS minStock, p.active, c.name AS category,
      COALESCE(SUM(it.quantity_change), 0) AS stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN inventory_transactions it ON it.product_id = p.id
    WHERE p.organization_id = ? AND p.active = 1 ${term ? 'AND (p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)' : ''}
    GROUP BY p.id ORDER BY p.name LIMIT 100`;
  return term ? db.prepare(sql).all(organizationId, `%${term}%`, `%${term}%`, `%${term}%`) : db.prepare(sql).all(organizationId);
}

export function createProduct(db, input, actor = null) {
  const name = asText(input.name, 'Product name');
  const sku = asText(input.sku || `SKU-${Date.now()}`, 'SKU');
  const costPrice = asAmount(input.costPrice, 'Cost price');
  const sellPrice = asAmount(input.sellPrice, 'Sell price');
  const minStock = asAmount(input.minStock ?? 0, 'Minimum stock');
  const categoryName = String(input.category || 'غير مصنف').trim() || 'غير مصنف';
  const category = db.prepare('SELECT id FROM categories WHERE organization_id = ? AND name = ?').get(organizationId, categoryName);
  const categoryId = category?.id || randomUUID();
  const timestamp = now();
  db.exec('BEGIN IMMEDIATE;');
  try {
    if (!category) db.prepare('INSERT INTO categories (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)').run(categoryId, organizationId, categoryName, timestamp);
    const id = randomUUID();
    db.prepare('INSERT INTO products (id, organization_id, legacy_id, category_id, sku, barcode, name, cost_price, sell_price, min_stock, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
      .run(id, organizationId, Number.isInteger(input.legacyId) ? input.legacyId : null, categoryId, sku, input.barcode ? String(input.barcode).trim() : null, name, costPrice, sellPrice, minStock, timestamp, timestamp);
    const initialStock = asAmount(input.initialStock ?? 0, 'Initial stock');
    if (initialStock > 0) {
      const warehouseId = input.warehouseId || defaultWarehouseId(db);
      db.prepare('INSERT INTO inventory_transactions (id, organization_id, product_id, warehouse_id, type, quantity_change, reference_type, reference_id, notes, occurred_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), organizationId, id, warehouseId, 'opening_balance', initialStock, 'product_create', id, 'رصيد افتتاحي', timestamp, actor);
    }
    audit(db, actor, 'product_created', 'product', id, { name, sku });
    db.exec('COMMIT;');
    return db.prepare('SELECT id, legacy_id AS legacyId, sku, barcode, name, cost_price AS costPrice, sell_price AS sellPrice, min_stock AS minStock FROM products WHERE id = ?').get(id);
  } catch (error) { db.exec('ROLLBACK;'); throw error; }
}

export function listCustomers(db, query = '') {
  const term = String(query).trim();
  const sql = `SELECT id, legacy_id AS legacyId, name, phone, email, credit_limit AS creditLimit, active
    FROM customers WHERE organization_id = ? AND active = 1 ${term ? 'AND (name LIKE ? OR phone LIKE ?)' : ''} ORDER BY name LIMIT 100`;
  return term ? db.prepare(sql).all(organizationId, `%${term}%`, `%${term}%`) : db.prepare(sql).all(organizationId);
}

export function createCustomer(db, input, actor = null) {
  const timestamp = now();
  const id = randomUUID();
  const name = asText(input.name, 'Customer name');
  const creditLimit = asAmount(input.creditLimit ?? 0, 'Credit limit');
  db.prepare('INSERT INTO customers (id, organization_id, legacy_id, name, phone, email, credit_limit, active, created_at, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
    .run(id, organizationId, Number.isInteger(input.legacyId) ? input.legacyId : null, name, input.phone ? String(input.phone).trim() : null, input.email ? String(input.email).trim() : null, creditLimit, timestamp, input.address ? String(input.address).trim() : null, input.notes ? String(input.notes).trim() : null);
  audit(db, actor, 'customer_created', 'customer', id, { name });
  return db.prepare('SELECT id, legacy_id AS legacyId, name, phone, email, address, notes, credit_limit AS creditLimit FROM customers WHERE id = ?').get(id);
}

export function updateProduct(db, id, input, actor = null) {
  const existing = db.prepare('SELECT id, category_id, cost_price, sell_price, min_stock FROM products WHERE id = ? AND organization_id = ?').get(id, organizationId);
  if (!existing) throw invalid('Product is invalid.');
  const name = asText(input.name, 'Product name');
  const sku = asText(input.sku, 'SKU');
  const costPrice = asAmount(input.costPrice, 'Cost price');
  const sellPrice = asAmount(input.sellPrice, 'Sell price');
  const minStock = asAmount(input.minStock ?? 0, 'Minimum stock');
  const categoryName = String(input.category || 'غير مصنف').trim() || 'غير مصنف';
  const timestamp = now();
  db.exec('BEGIN IMMEDIATE;');
  try {
    let category = db.prepare('SELECT id FROM categories WHERE organization_id = ? AND name = ?').get(organizationId, categoryName);
    if (!category) {
      category = { id: randomUUID() };
      db.prepare('INSERT INTO categories (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)').run(category.id, organizationId, categoryName, timestamp);
    }
    db.prepare('UPDATE products SET category_id = ?, sku = ?, barcode = ?, name = ?, cost_price = ?, sell_price = ?, min_stock = ?, updated_at = ? WHERE id = ?')
      .run(category.id, sku, input.barcode ? String(input.barcode).trim() : null, name, costPrice, sellPrice, minStock, timestamp, id);
    if (input.stock !== undefined) {
      const warehouseId = input.warehouseId || defaultWarehouseId(db);
      const current = db.prepare('SELECT COALESCE(SUM(quantity_change), 0) AS stock FROM inventory_transactions WHERE product_id = ? AND warehouse_id = ?').get(id, warehouseId).stock;
      const target = asAmount(input.stock, 'Stock');
      const delta = target - current;
      if (Math.abs(delta) > 0.00001) db.prepare('INSERT INTO inventory_transactions (id, organization_id, product_id, warehouse_id, type, quantity_change, reference_type, reference_id, notes, occurred_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), organizationId, id, warehouseId, 'adjustment', delta, 'product_update', id, 'تعديل من شاشة المنتج', timestamp, actor);
    }
    audit(db, actor, 'product_updated', 'product', id, { name, sku });
    db.exec('COMMIT;');
    return db.prepare('SELECT id, legacy_id AS legacyId, sku, barcode, name, cost_price AS costPrice, sell_price AS sellPrice, min_stock AS minStock FROM products WHERE id = ?').get(id);
  } catch (error) { db.exec('ROLLBACK;'); throw error; }
}

export function updateCustomer(db, id, input, actor = null) {
  const existing = db.prepare('SELECT id FROM customers WHERE id = ? AND organization_id = ?').get(id, organizationId);
  if (!existing) throw invalid('Customer is invalid.');
  const name = asText(input.name, 'Customer name');
  db.prepare('UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, notes = ?, credit_limit = ? WHERE id = ?')
    .run(name, input.phone ? String(input.phone).trim() : null, input.email ? String(input.email).trim() : null, input.address ? String(input.address).trim() : null, input.notes ? String(input.notes).trim() : null, asAmount(input.creditLimit ?? 0, 'Credit limit'), id);
  audit(db, actor, 'customer_updated', 'customer', id, { name });
  return db.prepare('SELECT id, legacy_id AS legacyId, name, phone, email, address, notes, credit_limit AS creditLimit FROM customers WHERE id = ?').get(id);
}

export function getSaleForReturn(db, invoiceNumber) {
  const invoice = Number(invoiceNumber);
  if (!Number.isInteger(invoice) || invoice < 1) throw invalid('Invoice number is invalid.');
  const sale = db.prepare(`SELECT s.id, s.invoice_number AS invoiceNumber, s.status, s.customer_id AS customerId,
      c.name AS customerName, s.warehouse_id AS warehouseId, s.subtotal, s.discount, s.total, s.occurred_at AS occurredAt
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.organization_id = ? AND s.invoice_number = ?`).get(organizationId, invoice);
  if (!sale) throw invalid('Invoice was not found.');
  const items = db.prepare(`SELECT si.id, si.product_id AS productId, p.legacy_id AS productLegacyId, p.name,
      si.quantity, si.unit_price AS unitPrice, si.discount,
      si.quantity - COALESCE((SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.sale_item_id = si.id), 0) AS returnableQuantity
    FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = ? ORDER BY si.rowid`).all(sale.id);
  return { ...sale, items };
}

export function completeSale(db, input) {
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const payments = Array.isArray(input.payments) ? input.payments : [];
  if (!lines.length) throw invalid('At least one sale item is required.');
  if (!payments.length) throw invalid('At least one payment is required.');
  const warehouseId = input.warehouseId || defaultWarehouseId(db);
  const actor = actorId(db, input.actorId);
  const discount = asAmount(input.discount ?? 0, 'Discount');
  const timestamp = now();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const warehouse = db.prepare('SELECT id FROM warehouses WHERE id = ? AND organization_id = ? AND active = 1').get(warehouseId, organizationId);
    if (!warehouse) throw invalid('Warehouse is invalid.');
    const resolvedLines = lines.map((line) => {
      const productId = asText(line.productId, 'Product');
      const quantity = asAmount(line.quantity, 'Quantity', { minimum: 0.001 });
      const product = db.prepare('SELECT id, name, sell_price, cost_price FROM products WHERE id = ? AND organization_id = ? AND active = 1').get(productId, organizationId);
      if (!product) throw invalid('Product is invalid or inactive.');
      const stock = db.prepare('SELECT COALESCE(SUM(quantity_change), 0) AS quantity FROM inventory_transactions WHERE product_id = ? AND warehouse_id = ?').get(productId, warehouseId).quantity;
      if (stock < quantity) throw invalid(`Insufficient stock for ${product.name}.`);
      return { product, quantity, unitPrice: asAmount(line.unitPrice ?? product.sell_price, 'Unit price'), lineDiscount: asAmount(line.discount ?? 0, 'Line discount') };
    });
    const subtotal = resolvedLines.reduce((sum, line) => sum + line.unitPrice * line.quantity - line.lineDiscount, 0);
    if (discount > subtotal) throw invalid('Discount cannot exceed subtotal.');
    const total = subtotal - discount;
    const resolvedPayments = payments.map((payment) => {
      const method = asText(payment.method, 'Payment method').toLowerCase();
      if (!paymentMethods.has(method)) throw invalid('Payment method is invalid.');
      return { method, amount: asAmount(payment.amount, 'Payment amount', { minimum: 0 }) };
    });
    const paid = resolvedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    if (Math.abs(paid - total) > 0.01) throw invalid('Payments must equal the sale total.');
    const customerId = input.customerId || null;
    if (resolvedPayments.some((payment) => payment.method === 'credit') && !customerId) throw invalid('A customer is required for credit sales.');
    if (customerId && !db.prepare('SELECT id FROM customers WHERE id = ? AND organization_id = ? AND active = 1').get(customerId, organizationId)) throw invalid('Customer is invalid.');
    const invoiceNumber = db.prepare('SELECT COALESCE(MAX(invoice_number), 1000) + 1 AS value FROM sales WHERE organization_id = ?').get(organizationId).value;
    const saleId = randomUUID();
    db.prepare('INSERT INTO sales (id, organization_id, invoice_number, customer_id, warehouse_id, status, subtotal, discount, total, occurred_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(saleId, organizationId, invoiceNumber, customerId, warehouseId, 'completed', subtotal, discount, total, timestamp, actor);
    for (const line of resolvedLines) {
      db.prepare('INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, discount) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), saleId, line.product.id, line.quantity, line.unitPrice, line.product.cost_price, line.lineDiscount);
      db.prepare('INSERT INTO inventory_transactions (id, organization_id, product_id, warehouse_id, type, quantity_change, reference_type, reference_id, notes, occurred_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), organizationId, line.product.id, warehouseId, 'sale', -line.quantity, 'sale', saleId, `فاتورة #${invoiceNumber}`, timestamp, actor);
    }
    for (const payment of resolvedPayments) db.prepare('INSERT INTO payments (id, sale_id, method, amount, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), saleId, payment.method, payment.amount, timestamp);
    audit(db, actor, 'sale_completed', 'sale', saleId, { invoiceNumber, total, itemCount: resolvedLines.length });
    db.exec('COMMIT;');
    return { id: saleId, invoiceNumber, subtotal, discount, total, occurredAt: timestamp };
  } catch (error) { db.exec('ROLLBACK;'); throw error; }
}

/**
 * Records a full or partial return against a completed sale. Each returned
 * quantity is checked against the original sale less all prior returns, then
 * stock and refund records are written in the same transaction.
 */
export function completeReturn(db, input) {
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const payments = Array.isArray(input.payments) ? input.payments : [];
  if (!lines.length) throw invalid('At least one return item is required.');
  if (!payments.length) throw invalid('At least one refund payment is required.');
  const saleId = asText(input.saleId, 'Sale');
  const actor = actorId(db, input.actorId);
  const timestamp = now();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const sale = db.prepare("SELECT id, invoice_number, warehouse_id, status FROM sales WHERE id = ? AND organization_id = ?").get(saleId, organizationId);
    if (!sale || sale.status !== 'completed') throw invalid('Sale is invalid or cannot be returned.');
    const warehouseId = input.warehouseId || sale.warehouse_id;
    if (!db.prepare('SELECT id FROM warehouses WHERE id = ? AND organization_id = ? AND active = 1').get(warehouseId, organizationId)) throw invalid('Warehouse is invalid.');
    const resolvedLines = lines.map((line) => {
      const saleItemId = asText(line.saleItemId, 'Sale item');
      const quantity = asAmount(line.quantity, 'Return quantity', { minimum: 0.001 });
      const item = db.prepare(`SELECT si.id, si.product_id, si.quantity, si.unit_price, si.discount, p.name
        FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.id = ? AND si.sale_id = ?`).get(saleItemId, saleId);
      if (!item) throw invalid('Sale item is invalid.');
      const alreadyReturned = db.prepare('SELECT COALESCE(SUM(quantity), 0) AS quantity FROM return_items WHERE sale_item_id = ?').get(saleItemId).quantity;
      if (quantity > item.quantity - alreadyReturned + 0.00001) throw invalid(`Return quantity exceeds the sold quantity for ${item.name}.`);
      const proportionalDiscount = item.quantity ? item.discount * (quantity / item.quantity) : 0;
      return { item, quantity, refundAmount: asAmount(line.refundAmount ?? (item.unit_price * quantity - proportionalDiscount), 'Refund amount') };
    });
    const refundTotal = resolvedLines.reduce((sum, line) => sum + line.refundAmount, 0);
    const resolvedPayments = payments.map((payment) => {
      const method = asText(payment.method, 'Refund method').toLowerCase();
      if (!paymentMethods.has(method)) throw invalid('Refund method is invalid.');
      return { method, amount: asAmount(payment.amount, 'Refund amount') };
    });
    const refunded = resolvedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    if (Math.abs(refunded - refundTotal) > 0.01) throw invalid('Refund payments must equal the return total.');
    const returnId = randomUUID();
    db.prepare('INSERT INTO returns (id, organization_id, sale_id, warehouse_id, status, refund_total, notes, occurred_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(returnId, organizationId, saleId, warehouseId, 'completed', refundTotal, input.notes ? String(input.notes).trim() : null, timestamp, actor);
    for (const line of resolvedLines) {
      db.prepare('INSERT INTO return_items (id, return_id, sale_item_id, product_id, quantity, refund_amount) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), returnId, line.item.id, line.item.product_id, line.quantity, line.refundAmount);
      db.prepare('INSERT INTO inventory_transactions (id, organization_id, product_id, warehouse_id, type, quantity_change, reference_type, reference_id, notes, occurred_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), organizationId, line.item.product_id, warehouseId, 'return', line.quantity, 'return', returnId, `Return for invoice #${sale.invoice_number}`, timestamp, actor);
    }
    for (const payment of resolvedPayments) db.prepare('INSERT INTO return_payments (id, return_id, method, amount, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), returnId, payment.method, payment.amount, timestamp);
    const remaining = db.prepare(`SELECT COALESCE(SUM(si.quantity), 0) - COALESCE((SELECT SUM(ri.quantity) FROM return_items ri
      JOIN sale_items returned_si ON returned_si.id = ri.sale_item_id WHERE returned_si.sale_id = ?), 0) AS quantity
      FROM sale_items si WHERE si.sale_id = ?`).get(saleId, saleId).quantity;
    if (remaining <= 0.00001) db.prepare("UPDATE sales SET status = 'returned' WHERE id = ?").run(saleId);
    audit(db, actor, 'return_completed', 'return', returnId, { saleId, invoiceNumber: sale.invoice_number, refundTotal, itemCount: resolvedLines.length });
    db.exec('COMMIT;');
    return { id: returnId, saleId, invoiceNumber: sale.invoice_number, refundTotal, occurredAt: timestamp };
  } catch (error) { db.exec('ROLLBACK;'); throw error; }
}
