import { randomUUID } from 'node:crypto';

const migrations = [
  {
    id: '001_core_business_tables',
    sql: `
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        legacy_id INTEGER,
        username TEXT NOT NULL,
        password_hash TEXT,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'warehouse')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        requires_password_reset INTEGER NOT NULL DEFAULT 1 CHECK (requires_password_reset IN (0, 1)),
        created_at TEXT NOT NULL,
        UNIQUE (organization_id, username),
        UNIQUE (organization_id, legacy_id)
      );
      CREATE TABLE warehouses (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        legacy_id INTEGER,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        UNIQUE (organization_id, code),
        UNIQUE (organization_id, legacy_id)
      );
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (organization_id, name)
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        legacy_id INTEGER,
        category_id TEXT REFERENCES categories(id),
        sku TEXT NOT NULL,
        barcode TEXT,
        name TEXT NOT NULL,
        cost_price REAL NOT NULL CHECK (cost_price >= 0),
        sell_price REAL NOT NULL CHECK (sell_price >= 0),
        min_stock REAL NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (organization_id, legacy_id),
        UNIQUE (organization_id, sku),
        UNIQUE (organization_id, barcode)
      );
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        legacy_id INTEGER,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        credit_limit REAL NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        UNIQUE (organization_id, legacy_id)
      );
      CREATE TABLE sales (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        legacy_id INTEGER,
        invoice_number INTEGER NOT NULL,
        customer_id TEXT REFERENCES customers(id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        status TEXT NOT NULL CHECK (status IN ('completed', 'voided', 'returned')),
        subtotal REAL NOT NULL CHECK (subtotal >= 0),
        discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
        total REAL NOT NULL CHECK (total >= 0),
        occurred_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id),
        UNIQUE (organization_id, legacy_id),
        UNIQUE (organization_id, invoice_number)
      );
      CREATE TABLE sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity REAL NOT NULL CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        cost_price REAL NOT NULL CHECK (cost_price >= 0),
        discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0)
      );
      CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id),
        method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'wallet', 'instapay', 'credit', 'mixed')),
        amount REAL NOT NULL CHECK (amount >= 0),
        created_at TEXT NOT NULL
      );
      CREATE TABLE inventory_transactions (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        type TEXT NOT NULL CHECK (type IN ('opening_balance', 'purchase', 'sale', 'return', 'adjustment', 'transfer_in', 'transfer_out')),
        quantity_change REAL NOT NULL CHECK (quantity_change <> 0),
        reference_type TEXT NOT NULL,
        reference_id TEXT,
        notes TEXT,
        occurred_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id)
      );
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        actor_id TEXT REFERENCES users(id),
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        occurred_at TEXT NOT NULL
      );
      CREATE TABLE legacy_imports (
        id TEXT PRIMARY KEY,
        imported_at TEXT NOT NULL,
        source_revision INTEGER NOT NULL UNIQUE,
        summary_json TEXT NOT NULL
      );
      CREATE INDEX product_lookup_idx ON products (organization_id, barcode, name);
      CREATE INDEX customer_lookup_idx ON customers (organization_id, phone, name);
      CREATE INDEX inventory_balance_idx ON inventory_transactions (organization_id, product_id, warehouse_id, occurred_at);
      CREATE INDEX sales_occurred_idx ON sales (organization_id, occurred_at DESC);
    `
  },
  {
    id: '002_customer_contact_metadata',
    sql: `
      ALTER TABLE customers ADD COLUMN address TEXT;
      ALTER TABLE customers ADD COLUMN notes TEXT;
    `
  },
  {
    id: '003_returns',
    sql: `
      CREATE TABLE returns (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        sale_id TEXT NOT NULL REFERENCES sales(id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        status TEXT NOT NULL CHECK (status IN ('completed', 'voided')),
        refund_total REAL NOT NULL CHECK (refund_total >= 0),
        notes TEXT,
        occurred_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id)
      );
      CREATE TABLE return_items (
        id TEXT PRIMARY KEY,
        return_id TEXT NOT NULL REFERENCES returns(id),
        sale_item_id TEXT NOT NULL REFERENCES sale_items(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity REAL NOT NULL CHECK (quantity > 0),
        refund_amount REAL NOT NULL CHECK (refund_amount >= 0)
      );
      CREATE TABLE return_payments (
        id TEXT PRIMARY KEY,
        return_id TEXT NOT NULL REFERENCES returns(id),
        method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'wallet', 'instapay', 'credit')),
        amount REAL NOT NULL CHECK (amount >= 0),
        created_at TEXT NOT NULL
      );
      CREATE INDEX return_sale_idx ON returns (organization_id, sale_id, occurred_at DESC);
      CREATE INDEX return_item_sale_item_idx ON return_items (sale_item_id);
    `
  }
];

export function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);
  const alreadyApplied = db.prepare('SELECT id FROM schema_migrations WHERE id = ?');
  const recordApplied = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
  for (const migration of migrations) {
    if (alreadyApplied.get(migration.id)) continue;
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(migration.sql);
      recordApplied.run(migration.id, new Date().toISOString());
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateTime(value) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function paymentMethod(value) {
  const normalized = String(value || 'cash').toLowerCase();
  const aliases = { transfer: 'instapay', bank_transfer: 'instapay', visa: 'card', bank: 'card' };
  const resolved = aliases[normalized] || normalized;
  return ['cash', 'card', 'wallet', 'instapay', 'credit', 'mixed'].includes(resolved) ? resolved : 'cash';
}

/**
 * Imports the legacy snapshot once. The snapshot's stock values become opening
 * balances; historic sales are imported separately and do not alter that balance.
 */
export function importLegacySnapshot(db, snapshot, revision) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('No legacy snapshot is available to import.');
  const prior = db.prepare('SELECT id FROM legacy_imports WHERE source_revision = ?').get(revision);
  if (prior) throw new Error(`Legacy revision ${revision} was already imported.`);

  const now = new Date().toISOString();
  const organizationId = 'local-store';
  const getCategory = db.prepare('SELECT id FROM categories WHERE organization_id = ? AND name = ?');
  const createCategory = db.prepare('INSERT INTO categories (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)');
  const insertWarehouse = db.prepare('INSERT OR IGNORE INTO warehouses (id, organization_id, legacy_id, name, code, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, organization_id, legacy_id, username, password_hash, display_name, role, active, requires_password_reset, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 1, ?)');
  const insertProduct = db.prepare('INSERT OR IGNORE INTO products (id, organization_id, legacy_id, category_id, sku, barcode, name, cost_price, sell_price, min_stock, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertCustomer = db.prepare('INSERT OR IGNORE INTO customers (id, organization_id, legacy_id, name, phone, email, credit_limit, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertInventory = db.prepare('INSERT INTO inventory_transactions (id, organization_id, product_id, warehouse_id, type, quantity_change, reference_type, reference_id, notes, occurred_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertSale = db.prepare('INSERT OR IGNORE INTO sales (id, organization_id, legacy_id, invoice_number, customer_id, warehouse_id, status, subtotal, discount, total, occurred_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertSaleItem = db.prepare('INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, discount) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertPayment = db.prepare('INSERT INTO payments (id, sale_id, method, amount, created_at) VALUES (?, ?, ?, ?, ?)');

  const ids = { warehouses: new Map(), users: new Map(), products: new Map(), customers: new Map() };
  const warehouses = Array.isArray(snapshot.warehouses) ? snapshot.warehouses : [];
  const users = Array.isArray(snapshot.users) ? snapshot.users : [];
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const customers = Array.isArray(snapshot.customers) ? snapshot.customers : [];
  const sales = Array.isArray(snapshot.sales) ? snapshot.sales : [];

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare('INSERT OR IGNORE INTO organizations (id, name, created_at) VALUES (?, ?, ?)')
      .run(organizationId, snapshot.settings?.storeName || 'Ahmed Store', now);

    for (const warehouse of warehouses) {
      const id = randomUUID();
      ids.warehouses.set(warehouse.id, id);
      insertWarehouse.run(id, organizationId, warehouse.id ?? null, warehouse.name || 'المخزن الرئيسي', warehouse.code || `W${warehouse.id || id.slice(0, 5)}`, warehouse.active === false ? 0 : 1, now);
    }
    if (!ids.warehouses.size) {
      const id = randomUUID();
      ids.warehouses.set(1, id);
      insertWarehouse.run(id, organizationId, 1, 'المخزن الرئيسي', 'MAIN', 1, now);
    }

    for (const user of users) {
      const id = randomUUID();
      ids.users.set(user.id, id);
      insertUser.run(id, organizationId, user.id ?? null, user.username || `legacy-${id.slice(0, 8)}`, user.name || 'مستخدم', user.role === 'admin' || user.role === 'manager' || user.role === 'warehouse' ? user.role : 'cashier', user.active === false ? 0 : 1, now);
    }

    for (const product of products) {
      const categoryName = product.category || 'غير مصنف';
      let category = getCategory.get(organizationId, categoryName);
      if (!category) {
        category = { id: randomUUID() };
        createCategory.run(category.id, organizationId, categoryName, now);
      }
      const id = randomUUID();
      ids.products.set(product.id, id);
      insertProduct.run(id, organizationId, product.id ?? null, category.id, product.sku || `LEGACY-${product.id || id.slice(0, 8)}`, product.barcode || null, product.name || 'منتج بدون اسم', number(product.costPrice), number(product.sellPrice), number(product.minStock), product.active === false ? 0 : 1, now, now);
      const warehouseId = ids.warehouses.get(product.warehouseId) || ids.warehouses.values().next().value;
      const stock = number(product.stock);
      if (stock !== 0) insertInventory.run(randomUUID(), organizationId, id, warehouseId, 'opening_balance', stock, 'legacy_snapshot', null, 'رصيد افتتاحي من النظام السابق', now, null);
    }

    for (const customer of customers) {
      const id = randomUUID();
      ids.customers.set(customer.id, id);
      insertCustomer.run(id, organizationId, customer.id ?? null, customer.name || 'عميل بدون اسم', customer.phone || null, customer.email || null, number(customer.creditLimit), customer.active === false ? 0 : 1, now);
    }

    for (const sale of sales) {
      const saleId = randomUUID();
      const warehouseId = ids.warehouses.get(sale.warehouseId) || ids.warehouses.values().next().value;
      const customerId = ids.customers.get(sale.customerId) || null;
      const userId = ids.users.get(sale.cashierId) || null;
      insertSale.run(saleId, organizationId, sale.id ?? null, number(sale.id), customerId, warehouseId, 'completed', number(sale.subtotal), number(sale.discount), number(sale.total), dateTime(`${sale.date || ''}T${sale.time || '00:00:00'}`), userId);
      for (const item of Array.isArray(sale.items) ? sale.items : []) {
        const productId = ids.products.get(item.productId);
        if (!productId) continue;
        insertSaleItem.run(randomUUID(), saleId, productId, number(item.qty, 1), number(item.price ?? item.sellPrice), number(item.costPrice), number(item.discount));
      }
      const payments = sale.paymentSplit && typeof sale.paymentSplit === 'object' ? Object.entries(sale.paymentSplit) : [[sale.paymentMethod || 'cash', sale.total]];
      for (const [method, amount] of payments) insertPayment.run(randomUUID(), saleId, paymentMethod(method), number(amount), now);
    }

    const summary = { warehouses: warehouses.length || 1, users: users.length, products: products.length, customers: customers.length, sales: sales.length };
    db.prepare('INSERT INTO legacy_imports (id, imported_at, source_revision, summary_json) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), now, revision, JSON.stringify(summary));
    db.exec('COMMIT;');
    return summary;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

export function getOverview(db) {
  const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  return {
    organizations: count('organizations'), users: count('users'), warehouses: count('warehouses'),
    products: count('products'), customers: count('customers'), sales: count('sales'),
    inventoryTransactions: count('inventory_transactions')
  };
}
