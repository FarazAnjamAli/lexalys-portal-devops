'use strict';
/* Client area: dashboard, orders (Module 3), own enquiries (Module 2), profile (Module 1). */
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const validate = require('../lib/validate');
const { RUSH, quote } = require('../lib/catalogue');
const { requireLogin } = require('../middleware/core');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireLogin);

router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const stats = await db.one(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status IN ('pending','approved','in_progress')), 0) AS active,
            COALESCE(SUM(status = 'delivered'), 0) AS delivered,
            COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN setup_total ELSE 0 END), 0) AS invested
     FROM orders WHERE user_id = ?`, [uid]
  );
  const orders = await db.query(
    `SELECT o.*, s.name AS service_name FROM orders o JOIN services s ON s.id = o.service_id
     WHERE o.user_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 5`, [uid]
  );
  const leads = await db.query(
    `SELECT l.*, s.name AS service_name FROM leads l LEFT JOIN services s ON s.id = l.service_id
     WHERE l.user_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT 5`, [uid]
  );
  res.render('account/dashboard', { title: 'Dashboard | Lexalys Labs', stats, orders, leads });
}));

/* ---------------------------------------------------------------- orders */
router.get('/orders', wrap(async (req, res) => {
  const orders = await db.query(
    `SELECT o.*, s.name AS service_name FROM orders o JOIN services s ON s.id = o.service_id
     WHERE o.user_id = ? ORDER BY o.created_at DESC, o.id DESC`, [req.user.id]
  );
  res.render('account/orders', { title: 'My orders | Lexalys Labs', orders });
}));

async function orderForm(res, { values = {}, errors = {}, status = 200 }) {
  const services = await db.query('SELECT * FROM services WHERE is_active = 1 ORDER BY code');
  res.status(status).render('account/order-new', { title: 'New order | Lexalys Labs', services, rush: RUSH, values, errors });
}

router.get('/orders/new', wrap(async (req, res) => {
  const values = { rush: 'standard' };
  if (req.query.service) {
    const s = await db.one('SELECT id FROM services WHERE slug = ? AND is_active = 1', [String(req.query.service)]);
    if (s) values.service_id = s.id;
  }
  await orderForm(res, { values });
}));

router.post('/orders', wrap(async (req, res) => {
  const values = {
    service_id: /^\d+$/.test(String(req.body.service_id || '')) ? Number(req.body.service_id) : null,
    rush: RUSH[req.body.rush] ? req.body.rush : '',
    care_plan: req.body.care_plan === 'on',
    notes: validate.str(req.body.notes, 2000),
    agree: req.body.agree === 'on',
  };
  const errors = {};
  const service = values.service_id
    ? await db.one('SELECT * FROM services WHERE id = ? AND is_active = 1', [values.service_id])
    : null;
  if (!service) errors.service_id = 'Choose a service.';
  if (!values.rush) errors.rush = 'Choose a delivery speed.';
  if (service && values.care_plan && !service.monthly_price) errors.care_plan = 'This service has no care plan.';
  if (!values.agree) errors.agree = 'Confirm that you understand the price is an estimate.';
  if (Object.keys(errors).length) return orderForm(res, { values, errors, status: 422 });

  const q = quote(service, values.rush, values.care_plan);
  const conn = await db.getPool().getConnection();
  let orderId;
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO orders (order_no, user_id, service_id, rush, care_plan, setup_total, monthly_total, timeline_days, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['T' + crypto.randomBytes(8).toString('hex'), req.user.id, service.id, values.rush,
        values.care_plan ? 1 : 0, q.setup, q.monthly, q.days, values.notes || null]
    );
    orderId = r.insertId;
    const orderNo = `LX-${new Date().getUTCFullYear()}-${String(orderId).padStart(5, '0')}`;
    await conn.query('UPDATE orders SET order_no = ? WHERE id = ?', [orderNo, orderId]);
    await conn.query('INSERT INTO order_events (order_id, status, note, actor_id) VALUES (?, ?, ?, ?)',
      [orderId, 'pending', 'Order placed by client', req.user.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  req.flash('success', 'Order placed. We will review it and confirm within one business day.');
  res.redirect(`/account/orders/${orderId}`);
}));

async function ownOrder(req) {
  if (!/^\d+$/.test(req.params.id)) return null;
  return db.one(
    `SELECT o.*, s.name AS service_name, s.slug AS service_slug, s.category AS service_category
     FROM orders o JOIN services s ON s.id = o.service_id WHERE o.id = ? AND o.user_id = ?`,
    [req.params.id, req.user.id]
  );
}

router.get('/orders/:id', wrap(async (req, res, next) => {
  const order = await ownOrder(req);
  if (!order) return next();
  const events = await db.query('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at, id', [order.id]);
  res.render('account/order', { title: `${order.order_no} | Lexalys Labs`, order, events, rush: RUSH });
}));

router.post('/orders/:id/cancel', wrap(async (req, res, next) => {
  const order = await ownOrder(req);
  if (!order) return next();
  if (order.status !== 'pending') {
    req.flash('error', 'Only pending orders can be cancelled. Contact us to change an approved order.');
    return res.redirect(`/account/orders/${order.id}`);
  }
  await db.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
  await db.query('INSERT INTO order_events (order_id, status, note, actor_id) VALUES (?, ?, ?, ?)',
    [order.id, 'cancelled', 'Cancelled by client', req.user.id]);
  req.flash('success', `Order ${order.order_no} has been cancelled.`);
  res.redirect(`/account/orders/${order.id}`);
}));

/* ------------------------------------------------------------- enquiries */
router.get('/enquiries', wrap(async (req, res) => {
  const leads = await db.query(
    `SELECT l.*, s.name AS service_name FROM leads l LEFT JOIN services s ON s.id = l.service_id
     WHERE l.user_id = ? ORDER BY l.created_at DESC, l.id DESC`, [req.user.id]
  );
  res.render('account/enquiries', { title: 'My enquiries | Lexalys Labs', leads });
}));

/* --------------------------------------------------------------- profile */
function profilePage(req, res, extra = {}, status = 200) {
  res.status(status).render('account/profile', {
    title: 'Profile | Lexalys Labs',
    values: extra.values || { full_name: req.user.full_name, company: req.user.company || '', phone: req.user.phone || '' },
    errors: extra.errors || {},
    pwErrors: extra.pwErrors || {},
  });
}

router.get('/profile', (req, res) => profilePage(req, res));

router.post('/profile', wrap(async (req, res) => {
  const { values, errors } = validate.profile(req.body);
  if (Object.keys(errors).length) return profilePage(req, res, { values, errors }, 422);
  await db.query('UPDATE users SET full_name = ?, company = ?, phone = ? WHERE id = ?',
    [values.full_name, values.company || null, values.phone || null, req.user.id]);
  req.flash('success', 'Profile updated.');
  res.redirect('/account/profile');
}));

router.post('/password', wrap(async (req, res) => {
  const { current, next, errors } = validate.passwordChange(req.body);
  if (!errors.current_password) {
    const row = await db.one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!(await bcrypt.compare(current, row.password_hash))) errors.current_password = 'Current password is incorrect.';
  }
  if (Object.keys(errors).length) return profilePage(req, res, { pwErrors: errors }, 422);
  await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(next, 10), req.user.id]);
  req.flash('success', 'Password changed.');
  res.redirect('/account/profile');
}));

module.exports = router;
