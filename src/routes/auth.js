'use strict';
/* Module 1: accounts - register, sign in, sign out. */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const validate = require('../lib/validate');
const { safeNext } = require('../middleware/core');
const { loginLimiter, registerLimiter } = require('../lib/limits');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/* A fixed hash to compare against when the email does not exist, so a wrong
   email and a wrong password take the same time to answer. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 10);

function signIn(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/account');
  res.render('register', { title: 'Create account | Lexalys Labs', values: {}, errors: {} });
});

router.post('/register', registerLimiter, wrap(async (req, res) => {
  const { values, password, errors } = validate.registration(req.body);
  if (!errors.email) {
    const taken = await db.one('SELECT id FROM users WHERE email = ?', [values.email]);
    if (taken) errors.email = 'An account with this email already exists.';
  }
  if (Object.keys(errors).length) {
    return res.status(422).render('register', { title: 'Create account | Lexalys Labs', values, errors });
  }
  const hash = await bcrypt.hash(password, 10);
  const result = await db.query(
    'INSERT INTO users (full_name, email, company, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
    [values.full_name, values.email, values.company || null, values.phone || null, hash]
  );
  await signIn(req, { id: result.insertId });
  req.flash('success', `Welcome to Lexalys Labs, ${values.full_name.split(' ')[0]}. Your account is ready.`);
  res.redirect('/account');
}));

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/account');
  if (req.query.signed_out && !res.locals.flash) res.locals.flash = { type: 'success', text: 'You have been signed out.' };
  res.render('login', { title: 'Sign in | Lexalys Labs', values: {}, errors: {}, next: safeNext(req.query.next, '') });
});

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const email = validate.str(req.body.email, 190).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const nextUrl = safeNext(req.body.next, '');
  const errors = {};
  if (!email) errors.email = 'Enter your email address.';
  if (!password) errors.password = 'Enter your password.';
  const fail = (status, formError) => res.status(status).render('login', {
    title: 'Sign in | Lexalys Labs', values: { email }, errors: { ...errors, form: formError }, next: nextUrl,
  });
  if (Object.keys(errors).length) return fail(422);

  const user = await db.one('SELECT id, password_hash, role, is_active FROM users WHERE email = ?', [email]);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return fail(401, 'Incorrect email or password.');
  if (!user.is_active) return fail(403, 'This account has been deactivated. Contact support@lexalyslabs.com.');

  await db.query('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
  await signIn(req, user);
  res.redirect(nextUrl || (user.role === 'admin' ? '/admin' : '/account'));
}));

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('lex.sid');
    res.redirect('/login?signed_out=1');
  });
});

module.exports = router;
