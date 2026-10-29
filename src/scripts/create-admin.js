'use strict';
/* npm run create-admin -- admin@example.com "StrongPass123" "Your Name"
   Creates an admin, or resets the password of an existing account and makes it admin. */
const db = require('../db');
const { EMAIL_RE } = require('../lib/validate');

const [email, password, name] = process.argv.slice(2);

if (!email || !password || !EMAIL_RE.test(email) || password.length < 8) {
  console.error('Usage: npm run create-admin -- <email> <password, 8+ chars> [full name]');
  process.exit(1);
}

db.init()
  .then(() => db.upsertAdmin({ email, password, name }))
  .then(async () => {
    console.log(`Admin ready: ${email.toLowerCase()}`);
    await db.close();
  })
  .catch(async (err) => {
    console.error('Failed:', err.message);
    await db.close();
    process.exit(1);
  });
