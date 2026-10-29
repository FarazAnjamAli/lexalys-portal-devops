'use strict';
/* Form validation. Each validator returns { values, errors } where errors is
   keyed by field name, so views can show the message under the right input. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-\s0-9]{7,20}$/;

function str(v, max = 2000) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, max);
}

function checkName(v, errors, field = 'full_name') {
  if (!v) errors[field] = 'Enter your full name.';
  else if (v.length < 2) errors[field] = 'Name must be at least 2 characters.';
}
function checkEmail(v, errors, field = 'email') {
  if (!v) errors[field] = 'Enter your email address.';
  else if (!EMAIL_RE.test(v)) errors[field] = 'Enter a valid email address.';
}
function checkPhone(v, errors, field = 'phone') {
  if (v && !PHONE_RE.test(v)) errors[field] = 'Enter a valid phone number.';
}
function checkPassword(v, errors, field = 'password') {
  if (!v) errors[field] = 'Enter a password.';
  else if (v.length < 8) errors[field] = 'Password must be at least 8 characters.';
  else if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) errors[field] = 'Password must contain letters and numbers.';
}

function registration(body) {
  const values = {
    full_name: str(body.full_name, 120),
    email: str(body.email, 190).toLowerCase(),
    company: str(body.company, 160),
    phone: str(body.phone, 40),
  };
  const password = typeof body.password === 'string' ? body.password : '';
  const confirm = typeof body.confirm_password === 'string' ? body.confirm_password : '';
  const errors = {};
  checkName(values.full_name, errors);
  checkEmail(values.email, errors);
  checkPhone(values.phone, errors);
  checkPassword(password, errors);
  if (!errors.password && password !== confirm) errors.confirm_password = 'Passwords do not match.';
  if (body.terms !== 'on') errors.terms = 'You must accept the terms to continue.';
  return { values, password, errors };
}

function profile(body) {
  const values = {
    full_name: str(body.full_name, 120),
    company: str(body.company, 160),
    phone: str(body.phone, 40),
  };
  const errors = {};
  checkName(values.full_name, errors);
  checkPhone(values.phone, errors);
  return { values, errors };
}

function passwordChange(body) {
  const errors = {};
  const current = typeof body.current_password === 'string' ? body.current_password : '';
  const next = typeof body.new_password === 'string' ? body.new_password : '';
  const confirm = typeof body.confirm_password === 'string' ? body.confirm_password : '';
  if (!current) errors.current_password = 'Enter your current password.';
  checkPassword(next, errors, 'new_password');
  if (!errors.new_password && next !== confirm) errors.confirm_password = 'Passwords do not match.';
  if (!errors.new_password && current && next === current) errors.new_password = 'New password must be different.';
  return { current, next, errors };
}

const LEAD_KINDS = ['contact', 'audit', 'callback'];
const BUDGETS = ['Under $1,000', '$1,000 - $2,500', '$2,500 - $5,000', '$5,000+', 'Not sure yet'];

function lead(body) {
  const values = {
    kind: LEAD_KINDS.includes(body.kind) ? body.kind : 'contact',
    full_name: str(body.full_name, 120),
    email: str(body.email, 190).toLowerCase(),
    company: str(body.company, 160),
    phone: str(body.phone, 40),
    service_id: /^\d+$/.test(String(body.service_id || '')) ? Number(body.service_id) : null,
    budget: BUDGETS.includes(body.budget) ? body.budget : '',
    message: str(body.message, 4000),
  };
  const errors = {};
  checkName(values.full_name, errors);
  checkEmail(values.email, errors);
  checkPhone(values.phone, errors);
  if (values.kind === 'callback' && !values.phone) errors.phone = 'Enter a phone number so we can call you back.';
  if (!values.message) errors.message = 'Tell us a little about what you need.';
  else if (values.message.length < 10) errors.message = 'Message must be at least 10 characters.';
  return { values, errors };
}

const CATEGORIES = require('./catalogue').CATEGORIES;

function service(body) {
  const int = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
  const values = {
    code: str(body.code, 10),
    slug: str(body.slug, 120).toLowerCase(),
    name: str(body.name, 160),
    category: str(body.category, 60),
    summary: str(body.summary, 2000),
    setup_price: int(body.setup_price),
    monthly_price: int(body.monthly_price),
    timeline_days: int(body.timeline_days),
    is_active: body.is_active === 'on' ? 1 : 0,
  };
  const errors = {};
  if (!/^[0-9A-Za-z]{1,10}$/.test(values.code)) errors.code = 'Code must be 1-10 letters or digits.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) errors.slug = 'Slug must be lowercase words joined by hyphens.';
  if (values.name.length < 3) errors.name = 'Name must be at least 3 characters.';
  if (!CATEGORIES.includes(values.category)) errors.category = 'Pick a category.';
  if (values.summary.length < 10) errors.summary = 'Summary must be at least 10 characters.';
  if (!Number.isInteger(values.setup_price) || values.setup_price < 1) errors.setup_price = 'Setup price must be a whole number above 0.';
  if (values.monthly_price !== null && (!Number.isInteger(values.monthly_price) || values.monthly_price < 0)) errors.monthly_price = 'Monthly price must be a whole number.';
  if (values.timeline_days !== null && (!Number.isInteger(values.timeline_days) || values.timeline_days < 1 || values.timeline_days > 365)) errors.timeline_days = 'Timeline must be 1 to 365 days.';
  return { values, errors };
}

module.exports = { registration, profile, passwordChange, lead, service, str, LEAD_KINDS, BUDGETS, EMAIL_RE };
