'use strict';
const crypto = require('crypto');
const db = require('../db');

/* Loads the signed-in user (fresh from the DB on every request, so a
   deactivated account or changed role takes effect immediately). */
async function loadUser(req, res, next) {
  res.locals.user = null;
  if (!req.session || !req.session.userId) return next();
  try {
    const user = await db.one(
      'SELECT id, full_name, email, company, phone, role, is_active, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );
    if (!user || !user.is_active) {
      delete req.session.userId;
      return next();
    }
    req.user = user;
    res.locals.user = user;
    next();
  } catch (err) { next(err); }
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  req.session.flash = { type: 'info', text: 'Please sign in to continue.' };
  const nextUrl = req.method === 'GET' ? req.originalUrl : '/account';
  return res.redirect('/login?next=' + encodeURIComponent(nextUrl));
}

function requireAdmin(req, res, next) {
  if (!req.user) return requireLogin(req, res, next);
  if (req.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Access denied', code: 403,
      message: 'This area is for Lexalys Labs staff only.',
    });
  }
  next();
}

/* One-shot flash messages, stored in the session. */
function flash(req, res, next) {
  res.locals.flash = req.session ? req.session.flash : null;
  if (req.session) delete req.session.flash;
  req.flash = (type, text) => { req.session.flash = { type, text }; };
  next();
}

/* CSRF protection: a per-session token that every POST form must echo back. */
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  if (req.method === 'POST') {
    const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
    const a = Buffer.from(String(sent));
    const b = Buffer.from(req.session.csrf);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).render('error', {
        title: 'Form expired', code: 403,
        message: 'This form has expired. Go back, refresh the page and try again.',
      });
    }
  }
  next();
}

/* Only allow internal redirects after login ("/account", never "//evil.com"). */
function safeNext(url, fallback = '/account') {
  if (typeof url !== 'string') return fallback;
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return fallback;
  return url;
}

module.exports = { loadUser, requireLogin, requireAdmin, flash, csrf, safeNext };
