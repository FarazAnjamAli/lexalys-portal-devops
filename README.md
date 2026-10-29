# Lexalys Labs Client Portal

A web app for the Lexalys Labs AI agency. Clients browse fixed-price services, send enquiries, place and track orders. Staff manage everything from an admin panel.

Built for the **DevOps for Cloud Computing, Assignment 1** course: the same code deploys on **AWS EC2 (IaaS)** and on **Elastic Beanstalk + S3 + RDS (PaaS)**. The step-by-step deployment guide is in [docs/DEPLOY-AWS.md](docs/DEPLOY-AWS.md).

**Stack:** Node.js, Express, EJS (server-rendered pages), MySQL 8. No front-end build step.

## Modules

| Module | What it covers | Tables |
|---|---|---|
| **1. Accounts and access** | Register, sign in, sign out, profile, change password, client and admin roles, admin can deactivate accounts | `users`, `sessions` |
| **2. Enquiries (lead management)** | Public contact form with three enquiry types, clients see their own enquiries, admin filters, searches, updates status and notes, deletes spam | `leads` |
| **3. Service catalogue and orders** | 19 services with search and category filter, rush pricing (x1.30 / x1.60 / x1.85) and care plans, order placement with server-side price calculation, client cancellation, admin order lifecycle (pending, approved, in progress, delivered, cancelled) with history, admin adds, edits and hides services | `services`, `orders`, `order_events` |

## Pages

| Public | Client (signed in) | Admin |
|---|---|---|
| `/` home with live rate card | `/account` dashboard | `/admin` overview and revenue |
| `/services` catalogue | `/account/orders` | `/admin/leads`, `/admin/leads/:id` |
| `/services/:slug` detail | `/account/orders/new` | `/admin/orders`, `/admin/orders/:id` |
| `/contact` enquiry form | `/account/orders/:id` | `/admin/services` (add, edit, hide) |
| `/login`, `/register` | `/account/enquiries` | `/admin/users` |
| `/health` JSON status | `/account/profile` | |

## Run it locally (optional)

You need Node.js 18+ and a MySQL 8 server (MySQL Installer or XAMPP both work).

```bash
cp .env.example .env        # then edit DB_* and ADMIN_* values
npm install
npm run db:init             # creates database, tables, 19 services, admin account
npm run seed:demo           # optional demo clients, leads and orders (password Demo12345)
npm start                   # http://localhost:3000
```

## Tests

`npm test` runs 23 end-to-end tests (registration, login, access control, CSRF, the contact form, the order pricing, the order lifecycle, service management and more) against a real MySQL database. They use their own throwaway accounts and clean up after themselves.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Starts the server. On start it creates any missing tables and seeds services. |
| `npm run db:init` | Sets up the database without starting the server |
| `npm run create-admin -- <email> <password> [name]` | Creates an admin or resets an admin password |
| `npm run seed:demo` | Adds demo data |
| `deploy\package.ps1` | Builds the zip for EC2 and Elastic Beanstalk |
| `sudo bash deploy/ec2/setup.sh` | Full setup on a fresh Ubuntu EC2 instance |

## Security notes

- Passwords are hashed with bcrypt. Sessions are stored in MySQL with an httpOnly, SameSite cookie.
- Every form carries a CSRF token. Sign-in, registration and the contact form are rate-limited.
- All SQL uses parameterised queries. Every page escapes output by default.
- Security headers come from Helmet, with a strict Content Security Policy.
- The evaluator's database account (`grader`) has `SELECT` only on `lexalys_portal`. See `db/readonly-user.sql`.

## Project layout

```
src/
  server.js            entry point
  app.js               Express app, security headers, sessions
  db.js                MySQL pool, migrations, seeding
  config.js            environment variables (DB_* or Elastic Beanstalk RDS_*)
  routes/              public, auth, account, admin
  lib/                 catalogue + pricing, validation, formatting, session store
views/                 EJS templates
public/                CSS, JS, images
db/schema.sql          the database schema
db/readonly-user.sql   the read-only grader account
deploy/                EC2 setup script, Nginx and PM2 config, zip packager
docs/DEPLOY-AWS.md     deployment manual for both parts
tests/                 end-to-end tests
```
