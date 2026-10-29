'use strict';
/* All settings come from environment variables (a .env file locally and on
   EC2, the Elastic Beanstalk "Environment properties" screen on PaaS).

   Database settings accept two spellings:
     DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME   (EC2, local)
     RDS_HOSTNAME / RDS_PORT / RDS_USERNAME / RDS_PASSWORD / RDS_DB_NAME
   The second set is what Elastic Beanstalk injects by itself when an RDS
   database is attached to the environment, so either way works there. */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const env = process.env;
const pick = (...names) => names.map((n) => env[n]).find((v) => v !== undefined && v !== '');

const config = {
  port: Number(env.PORT) || 3000,
  isProd: env.NODE_ENV === 'production',
  deployLabel: env.DEPLOY_LABEL || 'Local development',
  sessionSecret: env.SESSION_SECRET || '',
  cookieSecure: env.COOKIE_SECURE === 'true',
  db: {
    host: pick('DB_HOST', 'RDS_HOSTNAME') || '127.0.0.1',
    port: Number(pick('DB_PORT', 'RDS_PORT')) || 3306,
    user: pick('DB_USER', 'RDS_USERNAME') || 'root',
    password: pick('DB_PASSWORD', 'RDS_PASSWORD') || '',
    database: pick('DB_NAME', 'RDS_DB_NAME') || 'lexalys_portal',
    ssl: env.DB_SSL === 'rds' ? 'Amazon RDS' : undefined,
  },
  admin: {
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Lexalys Admin',
  },
};

if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) {
  throw new Error('DB_NAME may only contain letters, digits and underscores.');
}

module.exports = config;
