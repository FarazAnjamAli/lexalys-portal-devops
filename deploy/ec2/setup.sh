#!/usr/bin/env bash
# ============================================================================
# Lexalys Portal - one-shot setup for a fresh Ubuntu EC2 instance (IaaS).
#
# Usage, from inside the unzipped app folder on the instance:
#     sudo bash deploy/ec2/setup.sh
#
# It asks for three passwords (app DB user, read-only grader user, portal
# admin) unless you pass them as environment variables:
#     sudo DB_APP_PASSWORD=... GRADER_PASSWORD=... ADMIN_EMAIL=... ADMIN_PASSWORD=... bash deploy/ec2/setup.sh
#
# Every step is also written out by hand in docs/DEPLOY-AWS.md, so you can
# run them one at a time and screenshot each for the report.
# ============================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo bash deploy/ec2/setup.sh"; exit 1; fi

SRC_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR=/var/www/lexalys-portal
APP_USER="${SUDO_USER:-ubuntu}"
DB_NAME=lexalys_portal
DB_APP_USER=lexalys_app

ask() { # ask VAR "prompt" [silent]
  local var="$1" prompt="$2"
  if [ -z "${!var:-}" ]; then
    if [ "${3:-}" = "silent" ]; then read -r -s -p "$prompt: " "$var"; echo; else read -r -p "$prompt: " "$var"; fi
  fi
}
ask DB_APP_PASSWORD "Password for MySQL app user '$DB_APP_USER'" silent
ask GRADER_PASSWORD "Password for read-only MySQL user 'grader'" silent
ask ADMIN_EMAIL "Portal admin email"
ask ADMIN_PASSWORD "Portal admin password (8+ chars, letters and numbers)" silent
SEED_DEMO="${SEED_DEMO:-yes}"
for v in DB_APP_PASSWORD GRADER_PASSWORD ADMIN_PASSWORD; do
  if [[ "${!v}" =~ [\'\"\\\$\`[:space:]] ]]; then echo "$v must not contain quotes, backslashes, \$, backticks or spaces."; exit 1; fi
  if [ "$(printf '%s' "${!v}" | wc -c)" -lt 8 ]; then echo "$v must be at least 8 characters."; exit 1; fi
done

step() { printf '\n\033[1;35m==> %s\033[0m\n' "$1"; }

step "1/8 Installing Nginx, MySQL Server, Node.js and tools"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx mysql-server unzip curl ca-certificates
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  apt-get install -y nodejs npm
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Ubuntu's Node.js is too old, installing Node 20 from NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v pm2 >/dev/null || npm install -g pm2
node -v; npm -v; mysql --version; nginx -v

step "2/8 Starting services and enabling them on boot"
systemctl enable --now mysql nginx

step "3/8 Letting MySQL accept remote connections (for the grader)"
CNF=/etc/mysql/mysql.conf.d/mysqld.cnf
sed -i -E 's/^\s*bind-address\s*=.*/bind-address = 0.0.0.0/' "$CNF"
sed -i -E 's/^\s*mysqlx-bind-address\s*=.*/mysqlx-bind-address = 0.0.0.0/' "$CNF"
grep -q '^bind-address' "$CNF" || echo 'bind-address = 0.0.0.0' >> "$CNF"
systemctl restart mysql

step "4/8 Creating the database, the app user and the read-only grader user"
mysql <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_APP_USER}'@'localhost' IDENTIFIED BY '${DB_APP_PASSWORD}';
ALTER USER '${DB_APP_USER}'@'localhost' IDENTIFIED BY '${DB_APP_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_APP_USER}'@'localhost';
CREATE USER IF NOT EXISTS 'grader'@'%' IDENTIFIED BY '${GRADER_PASSWORD}';
ALTER USER 'grader'@'%' IDENTIFIED BY '${GRADER_PASSWORD}';
GRANT SELECT ON ${DB_NAME}.* TO 'grader'@'%';
FLUSH PRIVILEGES;
SQL
mysql -e "SHOW GRANTS FOR 'grader'@'%';"

step "5/8 Loading the schema"
mysql "${DB_NAME}" < "$SRC_DIR/db/schema.sql"
mysql "${DB_NAME}" -e "SHOW TABLES;"

step "6/8 Copying the app to $APP_DIR and installing dependencies"
mkdir -p "$APP_DIR"
cp -r "$SRC_DIR"/package.json "$SRC_DIR"/package-lock.json "$SRC_DIR"/src "$SRC_DIR"/views "$SRC_DIR"/public "$SRC_DIR"/db "$SRC_DIR"/deploy "$APP_DIR"/
SESSION_SECRET="$(openssl rand -hex 32)"
cat > "$APP_DIR/.env" <<ENV
NODE_ENV=production
PORT=3000
DEPLOY_LABEL=AWS EC2 (IaaS)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_APP_USER}
DB_PASSWORD=${DB_APP_PASSWORD}
DB_NAME=${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ENV
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chmod 600 "$APP_DIR/.env"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm ci --omit=dev && npm run db:init"
if [ "$SEED_DEMO" = "yes" ]; then sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm run seed:demo"; fi

step "7/8 Starting the app with PM2 (auto-restart on crash and reboot)"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && (pm2 delete lexalys-portal >/dev/null 2>&1 || true) && pm2 start deploy/ec2/ecosystem.config.js && pm2 save"
env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null

step "8/8 Putting Nginx in front on port 80"
cp "$APP_DIR/deploy/ec2/nginx-lexalys-portal.conf" /etc/nginx/sites-available/lexalys-portal
ln -sf /etc/nginx/sites-available/lexalys-portal /etc/nginx/sites-enabled/lexalys-portal
rm -f /etc/nginx/sites-enabled/default
chmod o+x /var /var/www "$APP_DIR"
nginx -t
systemctl reload nginx

sleep 2
TOKEN="$(curl -s -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)"
IP="$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
DNS="$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-hostname || true)"
echo
curl -s http://127.0.0.1/health && echo
echo
echo "Done. Open:  http://${DNS:-$IP}/"
echo "Grader DB:   host ${IP:-<public IP>}  port 3306  database ${DB_NAME}  user grader"
