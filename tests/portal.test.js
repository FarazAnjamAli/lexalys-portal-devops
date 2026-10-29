'use strict';
/* End-to-end tests over HTTP against a real MySQL database.
   Run with:  npm test   (needs the same .env as the app; it adds test rows
   with unique emails, so it is safe to run against a dev database). */
process.env.DISABLE_RATE_LIMIT = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { createApp } = require('../src/app');
const config = require('../src/config');

let server;
let base;
const stamp = Date.now();

/* A tiny browser: keeps cookies, reads the CSRF token from forms. */
function client() {
  const jar = new Map();
  async function request(path, { method = 'GET', form } = {}) {
    const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(base + path, { method, headers, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text };
  }
  async function csrf(path = '/contact') {
    const page = await request(path);
    const m = page.text.match(/name="_csrf" value="([a-f0-9]+)"/);
    assert.ok(m, `no CSRF token on ${path}`);
    return m[1];
  }
  async function post(path, form, tokenFrom) {
    const token = await csrf(tokenFrom || path);
    return request(path, { method: 'POST', form: { ...form, _csrf: token } });
  }
  return { request, csrf, post };
}

async function register(c, email, extra = {}) {
  return c.post('/register', {
    full_name: 'Test Client', email, company: 'Test Co', phone: '+92 300 0000000',
    password: 'Passw0rd123', confirm_password: 'Passw0rd123', terms: 'on', ...extra,
  });
}

async function adminClient() {
  const email = `admin.${stamp}@test.example`;
  await db.upsertAdmin({ email, password: 'AdminPass123', name: 'Test Admin' });
  const c = client();
  const r = await c.post('/login', { email, password: 'AdminPass123' }, '/login');
  assert.equal(r.location, '/admin');
  return c;
}

test.before(async () => {
  await db.init();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await db.query('DELETE FROM users WHERE email LIKE ?', [`%.${stamp}@test.example`]);
  await db.query('DELETE FROM leads WHERE email LIKE ?', [`%.${stamp}@test.example`]);
  await db.query("DELETE FROM services WHERE code LIKE 'T%'");
  server.close();
  await db.close();
});

/* ---------------------------------------------------------------- general */
test('TC01 home page shows the rate card from the database', async () => {
  const r = await client().request('/');
  assert.equal(r.status, 200);
  assert.match(r.text, /id="ratecard-list"/);
  assert.match(r.text, /AI Receptionist/);
});

test('TC02 health endpoint reports the database as connected', async () => {
  const r = await client().request('/health');
  const json = JSON.parse(r.text);
  assert.equal(json.status, 'ok');
  assert.equal(json.database, 'connected');
  assert.ok(json.services >= 19);
});

test('TC03 unknown page returns 404', async () => {
  const r = await client().request('/does-not-exist');
  assert.equal(r.status, 404);
});

/* ------------------------------------------------------- Module 1: accounts */
test('TC04 a visitor can register and lands on the dashboard', async () => {
  const c = client();
  const r = await register(c, `reg.${stamp}@test.example`);
  assert.equal(r.status, 302);
  assert.equal(r.location, '/account');
  const dash = await c.request('/account');
  assert.match(dash.text, /Welcome back, Test/);
  const row = await db.one('SELECT role FROM users WHERE email = ?', [`reg.${stamp}@test.example`]);
  assert.equal(row.role, 'client');
});

test('TC05 registration rejects a duplicate email', async () => {
  const email = `dup.${stamp}@test.example`;
  await register(client(), email);
  const r = await register(client(), email);
  assert.equal(r.status, 422);
  assert.match(r.text, /already exists/);
});

test('TC06 registration rejects a weak password and mismatched confirmation', async () => {
  const weak = await register(client(), `weak.${stamp}@test.example`, { password: 'short', confirm_password: 'short' });
  assert.equal(weak.status, 422);
  assert.match(weak.text, /at least 8 characters/);
  const mismatch = await register(client(), `mm.${stamp}@test.example`, { confirm_password: 'Different123' });
  assert.match(mismatch.text, /Passwords do not match/);
});

test('TC07 login fails with a wrong password', async () => {
  const email = `login.${stamp}@test.example`;
  await register(client(), email);
  const r = await client().post('/login', { email, password: 'WrongPass999' }, '/login');
  assert.equal(r.status, 401);
  assert.match(r.text, /Incorrect email or password/);
});

test('TC08 login succeeds and logout ends the session', async () => {
  const email = `inout.${stamp}@test.example`;
  await register(client(), email);
  const c = client();
  const r = await c.post('/login', { email, password: 'Passw0rd123' }, '/login');
  assert.equal(r.location, '/account');
  assert.equal((await c.request('/account')).status, 200);
  await c.post('/logout', {}, '/account');
  const after = await c.request('/account');
  assert.equal(after.status, 302);
  assert.match(after.location, /^\/login/);
});

test('TC09 the client area requires sign-in', async () => {
  const r = await client().request('/account/orders');
  assert.equal(r.status, 302);
  assert.equal(r.location, '/login?next=%2Faccount%2Forders');
});

test('TC10 a client cannot open the admin panel', async () => {
  const c = client();
  await register(c, `nosy.${stamp}@test.example`);
  const r = await c.request('/admin');
  assert.equal(r.status, 403);
});

test('TC11 a form without the CSRF token is refused', async () => {
  const r = await client().request('/contact', { method: 'POST', form: { full_name: 'X', email: 'x@y.com', message: 'hello there' } });
  assert.equal(r.status, 403);
});

test('TC12 a client can update their profile and change password', async () => {
  const email = `prof.${stamp}@test.example`;
  const c = client();
  await register(c, email);
  const p = await c.post('/account/profile', { full_name: 'Renamed Client', company: 'New Co', phone: '' }, '/account/profile');
  assert.equal(p.location, '/account/profile');
  const row = await db.one('SELECT full_name, company FROM users WHERE email = ?', [email]);
  assert.equal(row.full_name, 'Renamed Client');
  const pw = await c.post('/account/password', { current_password: 'Passw0rd123', new_password: 'NewPassw0rd1', confirm_password: 'NewPassw0rd1' }, '/account/profile');
  assert.equal(pw.location, '/account/profile');
  const login = await client().post('/login', { email, password: 'NewPassw0rd1' }, '/login');
  assert.equal(login.location, '/account');
});

/* ------------------------------------------------------- Module 2: leads */
test('TC13 the contact form saves a lead to the database', async () => {
  const email = `lead.${stamp}@test.example`;
  const c = client();
  const r = await c.post('/contact', { kind: 'contact', full_name: 'Lead Person', email, message: 'We need a chatbot for WhatsApp.' });
  assert.equal(r.location, '/contact/thanks');
  const thanks = await c.request('/contact/thanks');
  assert.match(thanks.text, /Your message is with us/);
  const row = await db.one('SELECT status, kind FROM leads WHERE email = ?', [email]);
  assert.equal(row.status, 'new');
  assert.equal(row.kind, 'contact');
});

test('TC14 the contact form validates email, message and callback phone', async () => {
  const r = await client().post('/contact', { kind: 'callback', full_name: 'A B', email: 'not-an-email', message: 'short' });
  assert.equal(r.status, 422);
  assert.match(r.text, /valid email/);
  assert.match(r.text, /at least 10 characters/);
  assert.match(r.text, /so we can call you back/);
});

test('TC15 admin can filter leads, update status and delete a lead', async () => {
  const email = `adminlead.${stamp}@test.example`;
  await client().post('/contact', { kind: 'audit', full_name: 'Audit Lead', email, message: 'Please audit our quoting process.' });
  const lead = await db.one('SELECT id FROM leads WHERE email = ?', [email]);
  const a = await adminClient();
  const list = await a.request(`/admin/leads?status=new&q=${encodeURIComponent(email)}`);
  assert.match(list.text, /Audit Lead/);
  const upd = await a.post(`/admin/leads/${lead.id}`, { status: 'qualified', admin_note: 'Call on Monday' }, `/admin/leads/${lead.id}`);
  assert.equal(upd.status, 302);
  const row = await db.one('SELECT status, admin_note FROM leads WHERE id = ?', [lead.id]);
  assert.equal(row.status, 'qualified');
  assert.equal(row.admin_note, 'Call on Monday');
  await a.post(`/admin/leads/${lead.id}/delete`, {}, `/admin/leads/${lead.id}`);
  assert.equal(await db.one('SELECT id FROM leads WHERE id = ?', [lead.id]), null);
});

/* ------------------------------------------- Module 3: services and orders */
test('TC16 service search and category filter narrow the catalogue', async () => {
  const c = client();
  const voice = await c.request('/services?q=voice');
  assert.match(voice.text, /AI Voice Agent/);
  assert.doesNotMatch(voice.text, /Google Maps Lead Generator/);
  const growth = await c.request('/services?category=Growth');
  assert.match(growth.text, /Google Maps Lead Generator/);
  assert.doesNotMatch(growth.text, /HR Recruiter Agent/);
  const none = await c.request('/services?q=zzzznothing');
  assert.match(none.text, /id="no-results"/);
});

test('TC17 placing an order calculates rush and care plan prices on the server', async () => {
  const c = client();
  await register(c, `order.${stamp}@test.example`);
  const s = await db.one("SELECT * FROM services WHERE code = '01'");
  const r = await c.post('/account/orders', { service_id: s.id, rush: 'faster25', care_plan: 'on', agree: 'on', notes: 'Twilio account ready' }, '/account/orders/new');
  assert.equal(r.status, 302);
  const id = r.location.split('/').pop();
  const o = await db.one('SELECT * FROM orders WHERE id = ?', [id]);
  assert.equal(o.setup_total, Math.round(s.setup_price * 1.3));
  assert.equal(o.monthly_total, s.monthly_price);
  assert.equal(o.timeline_days, Math.ceil(s.timeline_days * 0.75));
  assert.match(o.order_no, /^LX-\d{4}-\d{5}$/);
  const page = await c.request(r.location);
  assert.match(page.text, /Order placed by client/);
});

test('TC18 an order without a service or agreement is rejected', async () => {
  const c = client();
  await register(c, `badorder.${stamp}@test.example`);
  const r = await c.post('/account/orders', { service_id: '', rush: 'standard' }, '/account/orders/new');
  assert.equal(r.status, 422);
  assert.match(r.text, /Choose a service/);
  assert.match(r.text, /Confirm that you understand/);
});

test('TC19 a client can cancel a pending order but not another client\'s order', async () => {
  const c = client();
  await register(c, `cancel.${stamp}@test.example`);
  const s = await db.one("SELECT id FROM services WHERE code = '06'");
  const r = await c.post('/account/orders', { service_id: s.id, rush: 'standard', agree: 'on' }, '/account/orders/new');
  const path = r.location;
  const other = client();
  await register(other, `other.${stamp}@test.example`);
  assert.equal((await other.request(path)).status, 404);
  await c.post(`${path}/cancel`, {}, path);
  const o = await db.one('SELECT status FROM orders WHERE id = ?', [path.split('/').pop()]);
  assert.equal(o.status, 'cancelled');
});

test('TC20 admin moves an order through its lifecycle and invalid jumps are refused', async () => {
  const c = client();
  await register(c, `flow.${stamp}@test.example`);
  const s = await db.one("SELECT id FROM services WHERE code = '05'");
  const r = await c.post('/account/orders', { service_id: s.id, rush: 'standard', agree: 'on' }, '/account/orders/new');
  const id = r.location.split('/').pop();
  const a = await adminClient();
  const skip = await a.post(`/admin/orders/${id}/status`, { status: 'delivered' }, `/admin/orders/${id}`);
  assert.equal(skip.status, 302);
  assert.equal((await db.one('SELECT status FROM orders WHERE id = ?', [id])).status, 'pending');
  for (const st of ['approved', 'in_progress', 'delivered']) {
    await a.post(`/admin/orders/${id}/status`, { status: st, note: `to ${st}` }, `/admin/orders/${id}`);
  }
  assert.equal((await db.one('SELECT status FROM orders WHERE id = ?', [id])).status, 'delivered');
  const events = await db.query('SELECT status FROM order_events WHERE order_id = ? ORDER BY id', [id]);
  assert.deepEqual(events.map((e) => e.status), ['pending', 'approved', 'in_progress', 'delivered']);
});

test('TC21 admin adds a service, hides it, and hidden services leave the catalogue', async () => {
  const a = await adminClient();
  const code = `T${String(stamp).slice(-6)}`;
  const slug = `test-service-${stamp}`;
  const bad = await a.post('/admin/services', { code, slug: 'Bad Slug', name: 'X', category: '', summary: 'short', setup_price: '0' }, '/admin/services/new');
  assert.equal(bad.status, 422);
  const ok = await a.post('/admin/services', { code, slug, name: 'Invoice Chaser', category: 'Operations', summary: 'Chases unpaid invoices politely.', setup_price: '1400', monthly_price: '120', timeline_days: '6', is_active: 'on' }, '/admin/services/new');
  assert.equal(ok.location, '/admin/services');
  assert.equal((await client().request(`/services/${slug}`)).status, 200);
  const svc = await db.one('SELECT id FROM services WHERE slug = ?', [slug]);
  await a.post(`/admin/services/${svc.id}/toggle`, {}, '/admin/services');
  assert.equal((await client().request(`/services/${slug}`)).status, 404);
});

test('TC22 admin can deactivate a client, who can then no longer sign in', async () => {
  const email = `deact.${stamp}@test.example`;
  await register(client(), email);
  const u = await db.one('SELECT id FROM users WHERE email = ?', [email]);
  const a = await adminClient();
  await a.post(`/admin/users/${u.id}/toggle`, {}, '/admin/users');
  const r = await client().post('/login', { email, password: 'Passw0rd123' }, '/login');
  assert.equal(r.status, 403);
  assert.match(r.text, /deactivated/);
});

test('TC23 login redirect cannot be pointed at another site', async () => {
  const email = `redir.${stamp}@test.example`;
  await register(client(), email);
  const r = await client().post('/login', { email, password: 'Passw0rd123', next: '//evil.example' }, '/login');
  assert.equal(r.location, '/account');
});

test('config reads the database name', () => {
  assert.ok(config.db.database.length > 0);
});
