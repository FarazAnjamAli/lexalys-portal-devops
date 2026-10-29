'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const config = require('./config');
const db = require('./db');
const MySQLStore = require('./lib/session-store');
const { loadUser, flash, csrf } = require('./middleware/core');
const fmt = require('./lib/format');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', 1); // behind Nginx on EC2 and on Elastic Beanstalk
  app.disable('x-powered-by');

  /* Security headers. The site is served over plain HTTP on the default
     AWS URLs, so HSTS and upgrade-insecure-requests are switched off: with
     them on, a browser would refuse to load the stylesheet over http. */
  app.use(helmet({
    hsts: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com', 'https://api.fontshare.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://cdn.fontshare.com', 'data:'],
        'img-src': ["'self'", 'data:'],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProd ? '7d' : 0 }));
  app.get('/favicon.ico', (req, res) => res.redirect(301, '/static/img/favicon.svg'));

  /* Health check for Elastic Beanstalk, load balancers and the report. */
  app.get('/health', async (req, res) => {
    try {
      const row = await db.one('SELECT COUNT(*) AS services FROM services');
      res.json({ status: 'ok', database: 'connected', services: row.services, deploy: config.deployLabel, time: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ status: 'error', database: 'unreachable' });
    }
  });

  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  if (!config.sessionSecret) {
    console.warn('[app] SESSION_SECRET is not set. Using a random one: everyone is logged out on restart.');
  }
  app.use(session({
    name: 'lex.sid',
    secret: config.sessionSecret || crypto.randomBytes(32).toString('hex'),
    store: new MySQLStore(db),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }));

  app.use((req, res, next) => {
    res.locals.fmt = fmt;
    res.locals.path = req.path;
    res.locals.deployLabel = config.deployLabel;
    res.locals.title = 'Lexalys Labs';
    res.locals.errors = {};
    res.locals.values = {};
    res.locals.user = null;
    res.locals.flash = null;
    res.locals.csrfToken = '';
    next();
  });

  app.use(flash);
  app.use(csrf);
  app.use(loadUser);

  app.use(require('./routes/public'));
  app.use(require('./routes/auth'));
  app.use('/account', require('./routes/account'));
  app.use('/admin', require('./routes/admin'));

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Page not found', code: 404, message: 'That page does not exist or has moved.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    if (res.headersSent) return;
    res.status(500);
    try {
      res.render('error', { title: 'Something went wrong', code: 500, message: 'An unexpected error occurred. Please try again.' });
    } catch (e) {
      res.type('text').send('Something went wrong. Please try again.');
    }
  });

  return app;
}

module.exports = { createApp };
