import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { getOverview, importLegacySnapshot, runMigrations } from './src/database.mjs';
import { completeReturn, completeSale, createCustomer, createProduct, getSaleForReturn, listCustomers, listProducts, updateCustomer, updateProduct } from './src/business.mjs';

const port = Number(process.env.PORT || 3000);
const rootDir = resolve(import.meta.dirname, '..');
const dataDir = join(rootDir, 'data');
const backupDir = join(dataDir, 'backups');
const databasePath = join(dataDir, 'ahmed-store.db');
mkdirSync(backupDir, { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
`);
runMigrations(db);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > 20 * 1024 * 1024) {
        reject(new Error('Request body is too large.'));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      try { resolveBody(JSON.parse(body)); } catch { reject(new Error('Invalid JSON.')); }
    });
    request.on('error', reject);
  });
}

function getState() {
  const row = db.prepare('SELECT state_json, revision, updated_at FROM app_state WHERE id = 1').get();
  if (!row) return { store: null, revision: 0, updatedAt: null };
  return { store: JSON.parse(row.state_json), revision: row.revision, updatedAt: row.updated_at };
}

function saveState(store, expectedRevision) {
  const current = getState();
  if (current.revision !== expectedRevision) return { conflict: true, ...current };
  const revision = current.revision + 1;
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_state (id, state_json, revision, updated_at)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state_json = excluded.state_json,
      revision = excluded.revision,
      updated_at = excluded.updated_at
  `).run(JSON.stringify(store), revision, updatedAt);
  return { conflict: false, revision, updatedAt };
}

function createBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(backupDir, `ahmed-store-${stamp}.db`);
  // SQLite's VACUUM INTO creates a consistent copy while the server is running.
  const safePath = target.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${safePath}'`);
  return target;
}

function serveFile(requestPath, response) {
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const target = normalize(join(rootDir, relativePath));
  if (!target.startsWith(rootDir) || target.includes(`${join(rootDir, 'data')}`) || target.includes(`${join(rootDir, '.git')}`) || target.includes(`${join(rootDir, 'local-server')}`)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  if (!existsSync(target)) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'content-type': mimeTypes[extname(target)] || 'application/octet-stream' });
  response.end(readFileSync(target));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json(response, 200, { ok: true, database: databasePath, now: new Date().toISOString() });
    }
    if (request.method === 'GET' && url.pathname === '/api/store') return json(response, 200, getState());
    if (request.method === 'GET' && url.pathname === '/api/v1/overview') return json(response, 200, getOverview(db));
    if (request.method === 'GET' && url.pathname === '/api/v1/warehouses') {
      return json(response, 200, { warehouses: db.prepare('SELECT id, legacy_id AS legacyId, name, code FROM warehouses WHERE organization_id = ? AND active = 1 ORDER BY name').all('local-store') });
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/products') return json(response, 200, { products: listProducts(db, url.searchParams.get('q') || '') });
    if (request.method === 'POST' && url.pathname === '/api/v1/products') {
      const body = await readJson(request);
      return json(response, 201, { product: createProduct(db, body, body.actorId || null) });
    }
    if (request.method === 'PUT' && /^\/api\/v1\/products\/[^/]+$/.test(url.pathname)) {
      const body = await readJson(request);
      return json(response, 200, { product: updateProduct(db, decodeURIComponent(url.pathname.split('/').pop()), body, body.actorId || null) });
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/customers') return json(response, 200, { customers: listCustomers(db, url.searchParams.get('q') || '') });
    if (request.method === 'POST' && url.pathname === '/api/v1/customers') {
      const body = await readJson(request);
      return json(response, 201, { customer: createCustomer(db, body, body.actorId || null) });
    }
    if (request.method === 'PUT' && /^\/api\/v1\/customers\/[^/]+$/.test(url.pathname)) {
      const body = await readJson(request);
      return json(response, 200, { customer: updateCustomer(db, decodeURIComponent(url.pathname.split('/').pop()), body, body.actorId || null) });
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/sales') {
      const body = await readJson(request);
      return json(response, 201, { sale: completeSale(db, body) });
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/returns') {
      const body = await readJson(request);
      return json(response, 201, { return: completeReturn(db, body) });
    }
    if (request.method === 'GET' && /^\/api\/v1\/sales\/\d+$/.test(url.pathname)) {
      return json(response, 200, { sale: getSaleForReturn(db, url.pathname.split('/').pop()) });
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/migrations/legacy-snapshot') {
      const state = getState();
      if (!state.store) return json(response, 409, { error: 'No legacy snapshot has been saved yet.' });
      return json(response, 201, { imported: importLegacySnapshot(db, state.store, state.revision) });
    }
    if (request.method === 'PUT' && url.pathname === '/api/store') {
      const payload = await readJson(request);
      if (!payload || typeof payload.store !== 'object' || Array.isArray(payload.store) || !Number.isInteger(payload.revision)) {
        return json(response, 400, { error: 'A store object and integer revision are required.' });
      }
      const saved = saveState(payload.store, payload.revision);
      if (saved.conflict) return json(response, 409, { error: 'State changed on another terminal.', ...saved });
      return json(response, 200, saved);
    }
    if (request.method === 'POST' && url.pathname === '/api/backups') {
      const backupPath = createBackup();
      return json(response, 201, { backupPath });
    }
    if (request.method === 'GET') return serveFile(url.pathname, response);
    return json(response, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(error);
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return json(response, status, { error: error instanceof Error ? error.message : 'Unexpected server error.' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Ahmed Store local server is running at http://localhost:${port}`);
  console.log(`Database: ${databasePath}`);
});

process.on('SIGINT', () => { db.close(); server.close(() => process.exit(0)); });
