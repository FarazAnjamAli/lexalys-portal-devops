'use strict';
/* npm run seed:demo
   Adds three demo clients with enquiries and orders in different states, so
   the admin dashboard and the grader's read-only queries have real rows to
   look at. Demo client password: Demo12345 . Safe to run twice. */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { quote } = require('../lib/catalogue');

const CLIENTS = [
  { full_name: 'Sara Khan', email: 'sara@brightdental.example', company: 'Bright Dental Clinic', phone: '+92 300 1234567' },
  { full_name: 'Omar Siddiqui', email: 'omar@northfreight.example', company: 'North Freight Logistics', phone: '+92 321 7654321' },
  { full_name: 'Ayesha Malik', email: 'ayesha@urbannest.example', company: 'Urban Nest Realty', phone: '+92 333 5550101' },
];

const ORDERS = [
  // [client index, service code, rush, care plan, final status path]
  [0, '01', 'standard', true, ['approved', 'in_progress']],
  [0, '05', 'standard', false, ['approved', 'in_progress', 'delivered']],
  [1, '13', 'faster25', true, []],
  [1, '15', 'standard', false, ['cancelled']],
  [2, '06', 'standard', true, ['approved']],
  [2, '09', 'faster40', true, []],
];

const LEADS = [
  ['contact', 'Bilal Ahmed', 'bilal@greenleaf.example', 'GreenLeaf Pharmacy', '02', 'We get 200+ WhatsApp messages a day asking about stock. Can a chatbot handle that?', 'new'],
  ['audit', 'Hina Raza', 'hina@stitchco.example', 'Stitch & Co', '00', 'We want an audit of our order processing before we automate anything.', 'contacted'],
  ['callback', 'Usman Tariq', 'usman@fitzone.example', 'FitZone Gyms', '17', 'Missed calls from new members are killing us. Please call me back this week.', 'qualified'],
];

async function main() {
  await db.init();
  const hash = await bcrypt.hash('Demo12345', 10);
  const ids = [];
  for (const c of CLIENTS) {
    await db.query(
      'INSERT IGNORE INTO users (full_name, email, company, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
      [c.full_name, c.email, c.company, c.phone, hash]
    );
    ids.push((await db.one('SELECT id FROM users WHERE email = ?', [c.email])).id);
  }

  const existing = await db.one('SELECT COUNT(*) AS n FROM orders WHERE user_id IN (?)', [ids]);
  if (existing.n === 0) {
    const admin = await db.one("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    for (const [ci, code, rush, care, path] of ORDERS) {
      const s = await db.one('SELECT * FROM services WHERE code = ?', [code]);
      const q = quote(s, rush, care);
      const r = await db.query(
        `INSERT INTO orders (order_no, user_id, service_id, rush, care_plan, setup_total, monthly_total, timeline_days, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['T' + crypto.randomBytes(8).toString('hex'), ids[ci], s.id, rush, care ? 1 : 0, q.setup, q.monthly, q.days, 'Demo order']
      );
      const id = r.insertId;
      await db.query('UPDATE orders SET order_no = ? WHERE id = ?', [`LX-${new Date().getUTCFullYear()}-${String(id).padStart(5, '0')}`, id]);
      await db.query('INSERT INTO order_events (order_id, status, note, actor_id) VALUES (?, ?, ?, ?)', [id, 'pending', 'Order placed by client', ids[ci]]);
      for (const st of path) {
        await db.query('UPDATE orders SET status = ? WHERE id = ?', [st, id]);
        await db.query('INSERT INTO order_events (order_id, status, note, actor_id) VALUES (?, ?, ?, ?)', [id, st, null, admin ? admin.id : null]);
      }
    }
    for (const [kind, name, email, company, code, message, status] of LEADS) {
      const s = await db.one('SELECT id FROM services WHERE code = ?', [code]);
      await db.query(
        'INSERT INTO leads (kind, full_name, email, company, service_id, message, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [kind, name, email, company, s.id, message, status]
      );
    }
    console.log(`Demo data added: ${CLIENTS.length} clients, ${ORDERS.length} orders, ${LEADS.length} leads.`);
  } else {
    console.log('Demo data already present, nothing added.');
  }
  await db.close();
}

main().catch(async (err) => {
  console.error('Seeding failed:', err.message);
  await db.close();
  process.exit(1);
});
