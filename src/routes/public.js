'use strict';
/* Public pages: home, service catalogue, contact form (Module 2 + 3). */
const express = require('express');
const db = require('../db');
const validate = require('../lib/validate');
const { CATEGORIES, RUSH } = require('../lib/catalogue');
const { contactLimiter } = require('../lib/limits');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const FEATURED = ['01', '02', '10', '17', '09', '06'];

router.get('/', wrap(async (req, res) => {
  const featured = await db.query(
    `SELECT * FROM services WHERE is_active = 1 AND code IN (?) ORDER BY FIELD(code, ?)`,
    [FEATURED, FEATURED]
  );
  const stats = await db.one(
    `SELECT (SELECT COUNT(*) FROM services WHERE is_active = 1) AS services,
            (SELECT MIN(timeline_days) FROM services WHERE is_active = 1) AS fastest,
            (SELECT MIN(setup_price) FROM services WHERE is_active = 1) AS from_price`
  );
  res.render('home', { title: 'Lexalys Labs | AI agents and automations', featured, stats });
}));

router.get('/services', wrap(async (req, res) => {
  const q = validate.str(req.query.q, 80);
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : '';
  const where = ['is_active = 1'];
  const params = [];
  if (q) {
    where.push('(name LIKE ? OR summary LIKE ? OR category LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (category) { where.push('category = ?'); params.push(category); }
  const services = await db.query(`SELECT * FROM services WHERE ${where.join(' AND ')} ORDER BY code`, params);
  res.render('services', { title: 'Services | Lexalys Labs', services, q, category, categories: CATEGORIES });
}));

router.get('/services/:slug', wrap(async (req, res, next) => {
  const service = await db.one('SELECT * FROM services WHERE slug = ? AND is_active = 1', [req.params.slug]);
  if (!service) return next();
  const related = await db.query(
    'SELECT * FROM services WHERE category = ? AND id <> ? AND is_active = 1 ORDER BY code LIMIT 3',
    [service.category, service.id]
  );
  res.render('service', { title: `${service.name} | Lexalys Labs`, service, related, rush: RUSH });
}));

async function contactPage(res, { values = {}, errors = {}, status = 200 } = {}) {
  const services = await db.query('SELECT id, name, slug FROM services WHERE is_active = 1 ORDER BY code');
  res.status(status).render('contact', {
    title: 'Contact | Lexalys Labs', services, budgets: validate.BUDGETS, values, errors,
  });
}

router.get('/contact', wrap(async (req, res) => {
  const values = { kind: validate.LEAD_KINDS.includes(req.query.kind) ? req.query.kind : 'contact' };
  if (req.query.service) {
    const s = await db.one('SELECT id FROM services WHERE slug = ?', [String(req.query.service)]);
    if (s) values.service_id = s.id;
  }
  if (req.user) {
    Object.assign(values, { full_name: req.user.full_name, email: req.user.email, company: req.user.company || '', phone: req.user.phone || '' });
  }
  await contactPage(res, { values });
}));

router.post('/contact', contactLimiter, wrap(async (req, res) => {
  const { values, errors } = validate.lead(req.body);
  if (values.service_id) {
    const s = await db.one('SELECT id FROM services WHERE id = ?', [values.service_id]);
    if (!s) values.service_id = null;
  }
  if (Object.keys(errors).length) return contactPage(res, { values, errors, status: 422 });

  const result = await db.query(
    `INSERT INTO leads (kind, full_name, email, company, phone, service_id, budget, message, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [values.kind, values.full_name, values.email, values.company || null, values.phone || null,
      values.service_id, values.budget || null, values.message, req.user ? req.user.id : null]
  );
  req.session.lastLead = { id: result.insertId, name: values.full_name, kind: values.kind };
  res.redirect('/contact/thanks');
}));

router.get('/contact/thanks', (req, res) => {
  const lead = req.session.lastLead;
  if (!lead) return res.redirect('/contact');
  res.render('contact-thanks', { title: 'Thank you | Lexalys Labs', lead });
});

module.exports = router;
