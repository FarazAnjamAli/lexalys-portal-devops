'use strict';
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { SERVICES } = require('./lib/catalogue');

let pool = null;

function getPool() {
  if (!pool) throw new Error('Database not initialised. Call db.init() first.');
  return pool;
}

/* Small helpers so route code reads cleanly. */
async function query(sql, params) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}
async function one(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

function schemaStatements() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  return raw
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean);
}

async function createDatabaseIfMissing() {
  const { database, ...conn } = config.db;
  let c;
  try {
    c = await mysql.createConnection({ ...conn, connectTimeout: 10000 });
    await c.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (err) {
    /* A user that can only see its own database cannot CREATE DATABASE.
       That is fine as long as the database already exists, which the pool
       connection below will prove one way or the other. */
    if (err.code !== 'ER_DBACCESS_DENIED_ERROR' && err.code !== 'ER_ACCESS_DENIED_ERROR') throw err;
  } finally {
    if (c) await c.end().catch(() => {});
  }
}

async function migrate() {
  for (const stmt of schemaStatements()) await query(stmt);
}

async function seedServices() {
  const row = await one('SELECT COUNT(*) AS n FROM services');
  if (row.n > 0) return 0;
  for (const s of SERVICES) {
    await query(
      `INSERT IGNORE INTO services (code, slug, name, category, summary, setup_price, monthly_price, timeline_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.code, s.slug, s.name, s.category, s.summary, s.setup_price, s.monthly_price, s.timeline_days]
    );
  }
  return SERVICES.length;
}

/* Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if no admin exists.
   There is deliberately no built-in default password. */
async function ensureAdmin() {
  const existing = await one("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existing) return false;
  const { email, password, name } = config.admin;
  if (!email || !password) {
    console.warn('[db] No admin account yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, or run: npm run create-admin');
    return false;
  }
  await upsertAdmin({ email, password, name });
  console.log(`[db] Admin account created for ${email}`);
  return true;
}

async function upsertAdmin({ email, password, name }) {
  const hash = await bcrypt.hash(password, 10);
  await query(
    `INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'admin', is_active = 1`,
    [name || 'Lexalys Admin', email.toLowerCase(), hash]
  );
}

async function init() {
  await createDatabaseIfMissing();
  pool = mysql.createPool({
    ...config.db,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: false,
    timezone: 'Z',
  });
  await migrate();
  const seeded = await seedServices();
  if (seeded) console.log(`[db] Seeded ${seeded} services`);
  await ensureAdmin();
  return pool;
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { init, close, query, one, getPool, upsertAdmin, migrate };
