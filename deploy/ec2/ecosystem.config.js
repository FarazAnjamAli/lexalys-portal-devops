// PM2 process file: keeps the app running and restarts it after a crash or reboot.
//   pm2 start deploy/ec2/ecosystem.config.js && pm2 save
module.exports = {
  apps: [{
    name: 'lexalys-portal',
    script: 'src/server.js',
    cwd: '/var/www/lexalys-portal',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production' },
  }],
};
