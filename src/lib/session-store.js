'use strict';
/* A minimal express-session store backed by the `sessions` MySQL table.
   Keeps logins alive across restarts and across Elastic Beanstalk instances. */
const session = require('express-session');

class MySQLStore extends session.Store {
  constructor(db, { ttlSeconds = 60 * 60 * 24 * 7 } = {}) {
    super();
    this.db = db;
    this.ttl = ttlSeconds;
    this.timer = setInterval(() => this.prune(), 15 * 60 * 1000);
    this.timer.unref();
  }

  now() { return Math.floor(Date.now() / 1000); }

  expiryFor(sess) {
    if (sess && sess.cookie && sess.cookie.expires) {
      return Math.floor(new Date(sess.cookie.expires).getTime() / 1000);
    }
    return this.now() + this.ttl;
  }

  get(sid, cb) {
    this.db.one('SELECT data, expires FROM sessions WHERE sid = ?', [sid])
      .then((row) => {
        if (!row || row.expires < this.now()) return cb(null, null);
        cb(null, JSON.parse(row.data));
      })
      .catch(cb);
  }

  set(sid, sess, cb) {
    this.db.query(
      'INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)',
      [sid, this.expiryFor(sess), JSON.stringify(sess)]
    ).then(() => cb && cb(null)).catch((e) => cb && cb(e));
  }

  touch(sid, sess, cb) {
    this.db.query('UPDATE sessions SET expires = ? WHERE sid = ?', [this.expiryFor(sess), sid])
      .then(() => cb && cb(null)).catch((e) => cb && cb(e));
  }

  destroy(sid, cb) {
    this.db.query('DELETE FROM sessions WHERE sid = ?', [sid])
      .then(() => cb && cb(null)).catch((e) => cb && cb(e));
  }

  prune() {
    this.db.query('DELETE FROM sessions WHERE expires < ?', [this.now()]).catch(() => {});
  }
}

module.exports = MySQLStore;
