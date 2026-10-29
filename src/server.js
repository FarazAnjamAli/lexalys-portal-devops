'use strict';
const config = require('./config');
const db = require('./db');
const { createApp } = require('./app');

async function main() {
  console.log(`[server] Connecting to MySQL at ${config.db.host}:${config.db.port}/${config.db.database} as ${config.db.user}`);
  await db.init();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] Lexalys Portal listening on port ${config.port} (${config.deployLabel})`);
  });
  const stop = () => server.close(() => db.close().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  if (err.code === 'ECONNREFUSED') console.error('  MySQL is not reachable. Is it running, and are DB_HOST / DB_PORT right?');
  if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('  Wrong DB_USER or DB_PASSWORD.');
  if (err.code === 'ETIMEDOUT') console.error('  Connection timed out. On AWS this is almost always a security group that does not allow port 3306.');
  process.exit(1);
});
