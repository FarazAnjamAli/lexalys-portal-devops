'use strict';
/* npm run db:init
   Creates the database (if allowed), all tables, the 19 services and the
   admin account from ADMIN_EMAIL / ADMIN_PASSWORD. Safe to run repeatedly. */
const db = require('../db');

db.init()
  .then(async () => {
    const tables = await db.query('SHOW TABLES');
    const services = await db.one('SELECT COUNT(*) AS n FROM services');
    const admins = await db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
    console.log(`Tables: ${tables.map((t) => Object.values(t)[0]).join(', ')}`);
    console.log(`Services: ${services.n}   Admin accounts: ${admins.n}`);
    console.log('Database is ready.');
    await db.close();
  })
  .catch(async (err) => {
    console.error('Database setup failed:', err.message);
    await db.close();
    process.exit(1);
  });
