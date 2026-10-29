'use strict';
/* Admin panel: dashboard, leads (Module 2), orders + services (Module 3), users (Module 1). */
const express = require('express');
const db = require('../db');
const validate = require('../lib/validate');
const { CATEGORIES, RUSH } = require('../lib/catalogue');
const { requireAdmin } = require('../middleware/core');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const isId = (v) => /^\d+$/.test(String(v));

router.use(requireAdmin);

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];
const ORDER_STATUSES = ['pending', 'approved', 'in_progress', 'delivered', 'cancelled'];
/* Which status an order may move to from each status. */
const ORDER_FLOW = {
  pending: ['approved', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

router.get('/', wrap(async (req, res) => {
  const stats = await db.one(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'client') AS clients,
            (SELECT COUNT(*) FROM leads) AS leads,
            (SELECT COUNT(*) FROM leads WHERE status = 'new') AS new_leads,
            (SELECT COUNT(*) FROM orders) AS orders,
            (SELECT COUNT(*) FROM orders WHERE status IN ('pending')) AS pending_orders,
            (SELECT COALESCE(SUM(setup_total), 0) FROM orders WHERE status IN ('approved','in_progress','delivered')) AS booked,
            (SELECT COALESCE(SUM(monthly_total), 0) FROM orders WHERE status IN ('approved','in_progress','delivered')) AS mrr,
            (SELECT COUNT(*) FROM services WHERE is_active = 1) AS services`
  );
  const byStatus = await db.query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
  const leads = await db.query('SELECT * FROM leads ORDER BY created_at DESC, id DESC LIMIT 5');
  const orders = await db.query(
    `SELECT o.*, s.name AS service_name, u.full_name AS client_name FROM orders o
     JOIN services s ON s.id = o.service_id JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC, o.id DESC LIMIT 5`
  );
  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  byStatus.forEach((r) => { statusCounts[r.status] = r.n; });
  res.render('admin/dashboard', { title: 'Admin | Lexalys Labs', stats, statusCounts, leads, orders });
}));

/* ----------------------------------------------------------------- leads */
router.get('/leads', wrap(async (req, res) => {
  const status = LEAD_STATUSES.includes(req.query.status) ? req.query.status : '';
  const q = validate.str(req.query.q, 80);
  const where = ['1=1'];
  const params = [];
  if (status) { where.push('l.status = ?'); params.push(status); }
  if (q) { where.push('(l.full_name LIKE ? OR l.email LIKE ? OR l.company LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const leads = await db.query(
    `SELECT l.*, s.name AS service_name FROM leads l LEFT JOIN services s ON s.id = l.service_id
     WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC, l.id DESC`, params
  );
  res.render('admin/leads', { title: 'Leads | Admin', leads, status, q, statuses: LEAD_STATUSES });
}));

async function findLead(id) {
  if (!isId(id)) return null;
  return db.one(
    `SELECT l.*, s.name AS service_name, u.full_name AS account_name FROM leads l
     LEFT JOIN services s ON s.id = l.service_id LEFT JOIN users u ON u.id = l.user_id WHERE l.id = ?`, [id]
  );
}

router.get('/leads/:id', wrap(async (req, res, next) => {
  const lead = await findLead(req.params.id);
  if (!lead) return next();
  res.render('admin/lead', { title: `Lead #${lead.id} | Admin`, lead, statuses: LEAD_STATUSES });
}));

router.post('/leads/:id', wrap(async (req, res, next) => {
  const lead = await findLead(req.params.id);
  if (!lead) return next();
  const status = LEAD_STATUSES.includes(req.body.status) ? req.body.status : null;
  if (!status) {
    req.flash('error', 'Choose a valid status.');
    return res.redirect(`/admin/leads/${lead.id}`);
  }
  await db.query('UPDATE leads SET status = ?, admin_note = ? WHERE id = ?',
    [status, validate.str(req.body.admin_note, 2000) || null, lead.id]);
  req.flash('success', `Lead #${lead.id} updated.`);
  res.redirect(`/admin/leads/${lead.id}`);
}));

router.post('/leads/:id/delete', wrap(async (req, res, next) => {
  const lead = await findLead(req.params.id);
  if (!lead) return next();
  await db.query('DELETE FROM leads WHERE id = ?', [lead.id]);
  req.flash('success', `Lead #${lead.id} deleted.`);
  res.redirect('/admin/leads');
}));

/* ---------------------------------------------------------------- orders */
router.get('/orders', wrap(async (req, res) => {
  const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : '';
  const q = validate.str(req.query.q, 80);
  const where = ['1=1'];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (q) { where.push('(o.order_no LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const orders = await db.query(
    `SELECT o.*, s.name AS service_name, u.full_name AS client_name, u.email AS client_email FROM orders o
     JOIN services s ON s.id = o.service_id JOIN users u ON u.id = o.user_id
     WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC, o.id DESC`, params
  );
  res.render('admin/orders', { title: 'Orders | Admin', orders, status, q, statuses: ORDER_STATUSES });
}));

async function findOrder(id) {
  if (!isId(id)) return null;
  return db.one(
    `SELECT o.*, s.name AS service_name, s.slug AS service_slug, u.full_name AS client_name, u.email AS client_email,
            u.company AS client_company, u.phone AS client_phone
     FROM orders o JOIN services s ON s.id = o.service_id JOIN users u ON u.id = o.user_id WHERE o.id = ?`, [id]
  );
}

router.get('/orders/:id', wrap(async (req, res, next) => {
  const order = await findOrder(req.params.id);
  if (!order) return next();
  const events = await db.query(
    `SELECT e.*, u.full_name AS actor_name FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.order_id = ? ORDER BY e.created_at, e.id`, [order.id]
  );
  res.render('admin/order', { title: `${order.order_no} | Admin`, order, events, next: ORDER_FLOW[order.status], rush: RUSH });
}));

router.post('/orders/:id/status', wrap(async (req, res, next) => {
  const order = await findOrder(req.params.id);
  if (!order) return next();
  const to = req.body.status;
  if (!ORDER_FLOW[order.status].includes(to)) {
    req.flash('error', `An order that is ${order.status.replace('_', ' ')} cannot move to "${String(to || '')}".`);
    return res.redirect(`/admin/orders/${order.id}`);
  }
  await db.query('UPDATE orders SET status = ? WHERE id = ?', [to, order.id]);
  await db.query('INSERT INTO order_events (order_id, status, note, actor_id) VALUES (?, ?, ?, ?)',
    [order.id, to, validate.str(req.body.note, 500) || null, req.user.id]);
  req.flash('success', `${order.order_no} moved to ${to.replace('_', ' ')}.`);
  res.redirect(`/admin/orders/${order.id}`);
}));

/* -------------------------------------------------------------- services */
router.get('/services', wrap(async (req, res) => {
  const services = await db.query(
    `SELECT s.*, (SELECT COUNT(*) FROM orders o WHERE o.service_id = s.id) AS order_count
     FROM services s ORDER BY s.code`
  );
  res.render('admin/services', { title: 'Services | Admin', services });
}));

function serviceForm(res, { service = null, values = {}, errors = {}, status = 200 }) {
  res.status(status).render('admin/service-form', {
    title: service ? `Edit ${service.name} | Admin` : 'New service | Admin',
    service, values, errors, categories: CATEGORIES,
  });
}

async function duplicateErrors(values, exceptId = 0) {
  const errors = {};
  const code = await db.one('SELECT id FROM services WHERE code = ? AND id <> ?', [values.code, exceptId]);
  if (code) errors.code = 'Another service already uses this code.';
  const slug = await db.one('SELECT id FROM services WHERE slug = ? AND id <> ?', [values.slug, exceptId]);
  if (slug) errors.slug = 'Another service already uses this slug.';
  return errors;
}

router.get('/services/new', (req, res) => serviceForm(res, { values: { is_active: 1 } }));

router.post('/services', wrap(async (req, res) => {
  const { values, errors } = validate.service(req.body);
  Object.assign(errors, Object.keys(errors).length ? {} : await duplicateErrors(values));
  if (Object.keys(errors).length) return serviceForm(res, { values, errors, status: 422 });
  await db.query(
    `INSERT INTO services (code, slug, name, category, summary, setup_price, monthly_price, timeline_days, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [values.code, values.slug, values.name, values.category, values.summary, values.setup_price,
      values.monthly_price, values.timeline_days, values.is_active]
  );
  req.flash('success', `Service "${values.name}" created.`);
  res.redirect('/admin/services');
}));

router.get('/services/:id/edit', wrap(async (req, res, next) => {
  const service = isId(req.params.id) ? await db.one('SELECT * FROM services WHERE id = ?', [req.params.id]) : null;
  if (!service) return next();
  serviceForm(res, { service, values: service });
}));

router.post('/services/:id', wrap(async (req, res, next) => {
  const service = isId(req.params.id) ? await db.one('SELECT * FROM services WHERE id = ?', [req.params.id]) : null;
  if (!service) return next();
  const { values, errors } = validate.service(req.body);
  Object.assign(errors, Object.keys(errors).length ? {} : await duplicateErrors(values, service.id));
  if (Object.keys(errors).length) return serviceForm(res, { service, values, errors, status: 422 });
  await db.query(
    `UPDATE services SET code = ?, slug = ?, name = ?, category = ?, summary = ?, setup_price = ?,
       monthly_price = ?, timeline_days = ?, is_active = ? WHERE id = ?`,
    [values.code, values.slug, values.name, values.category, values.summary, values.setup_price,
      values.monthly_price, values.timeline_days, values.is_active, service.id]
  );
  req.flash('success', `Service "${values.name}" saved.`);
  res.redirect('/admin/services');
}));

router.post('/services/:id/toggle', wrap(async (req, res, next) => {
  const service = isId(req.params.id) ? await db.one('SELECT * FROM services WHERE id = ?', [req.params.id]) : null;
  if (!service) return next();
  await db.query('UPDATE services SET is_active = 1 - is_active WHERE id = ?', [service.id]);
  req.flash('success', `"${service.name}" is now ${service.is_active ? 'hidden from' : 'visible in'} the catalogue.`);
  res.redirect('/admin/services');
}));

/* ----------------------------------------------------------------- users */
router.get('/users', wrap(async (req, res) => {
  const q = validate.str(req.query.q, 80);
  const params = [];
  let where = '1=1';
  if (q) { where = '(u.full_name LIKE ? OR u.email LIKE ? OR u.company LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const users = await db.query(
    `SELECT u.id, u.full_name, u.email, u.company, u.role, u.is_active, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count
     FROM users u WHERE ${where} ORDER BY u.created_at DESC, u.id DESC`, params
  );
  res.render('admin/users', { title: 'Users | Admin', users, q });
}));

router.post('/users/:id/toggle', wrap(async (req, res, next) => {
  const target = isId(req.params.id) ? await db.one('SELECT id, full_name, is_active FROM users WHERE id = ?', [req.params.id]) : null;
  if (!target) return next();
  if (target.id === req.user.id) {
    req.flash('error', 'You cannot deactivate your own account.');
    return res.redirect('/admin/users');
  }
  await db.query('UPDATE users SET is_active = 1 - is_active WHERE id = ?', [target.id]);
  req.flash('success', `${target.full_name} has been ${target.is_active ? 'deactivated' : 'reactivated'}.`);
  res.redirect('/admin/users');
}));

module.exports = router;
