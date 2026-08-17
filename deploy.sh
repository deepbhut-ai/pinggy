#!/bin/bash
# ============================================================
# pinggy — Full Deployment Script for Linux Server
# ============================================================
# Run on a fresh Ubuntu/Debian server as root or sudo user.
#
# Usage:
#   sudo bash deploy.sh xyz.com admin@xyz.com
# ============================================================

set -e

DOMAIN="${1:-xyz.com}"
EMAIL="${2:-admin@${DOMAIN}}"
APP_DIR="/opt/pinggy"
PG_PASSWORD="${3:-$(openssl rand -base64 16)}"

echo "=========================================="
echo "  pinggy Deployment"
echo "  Domain:   ${DOMAIN}"
echo "  Email:    ${EMAIL}"
echo "  App dir:  ${APP_DIR}"
echo "=========================================="

# ---- 1. Install system packages ----
echo ""
echo "[1/7] Installing system packages..."
apt update -y
apt install -y python3 python3-venv python3-pip postgresql postgresql-contrib \
    nginx certbot python3-certbot-nginx git ufw

# ---- 2. Set up PostgreSQL ----
echo ""
echo "[2/7] Setting up PostgreSQL..."
sudo -u postgres psql <<EOF
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pinggy') THEN
      CREATE ROLE pinggy WITH LOGIN PASSWORD '${PG_PASSWORD}' CREATEDB;
   END IF;
END
\$\$;
EOF

PG_HBA=$(find /etc/postgresql -name pg_hba.conf | head -1)
if ! grep -q "pinggy" "$PG_HBA"; then
    sed -i "/^local/s/peer/trust/" "$PG_HBA"
    sed -i "/^host.*127.0.0.1/s/scram-sha-256/md5/" "$PG_HBA"
    systemctl restart postgresql
fi

# ---- 3. Clone/set up app ----
echo ""
echo "[3/7] Setting up application..."
if [ -f "run.py" ]; then
    mkdir -p "${APP_DIR}"
    cp -r . "${APP_DIR}/"
else
    git clone https://github.com/deepbhut-ai/pinggy.git "${APP_DIR}"
fi

cd "${APP_DIR}"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# ---- 4. Configure .env ----
echo ""
echo "[4/7] Configuring environment..."
JWT_SECRET=$(openssl rand -hex 32)

cat > .env <<EOF
APP_NAME=pinggy
APP_ENV=prod
APP_DEBUG=false
APP_HOST=127.0.0.1
APP_PORT=8000

POSTGRES_USER=pinggy
POSTGRES_PASSWORD=${PG_PASSWORD}
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=pinggy
DATABASE_URL=postgresql+psycopg://pinggy:${PG_PASSWORD}@localhost:5432/pinggy

JWT_SECRET=${JWT_SECRET}
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60

SSH_HOST=0.0.0.0
SSH_PORT=2222
TUNNEL_DOMAIN=${DOMAIN}
TUNNEL_PORT_MIN=10000
TUNNEL_PORT_MAX=20000
PROXY_PORT=8000
SUBDOMAIN_LENGTH=7
EOF

# ---- 5. Set up nginx ----
echo ""
echo "[5/7] Configuring nginx..."
sed "s/xyz.com/${DOMAIN}/g" nginx/pinggy.conf > /etc/nginx/sites-available/pinggy
ln -sf /etc/nginx/sites-available/pinggy /etc/nginx/sites-enabled/pinggy
rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/certbot

# ---- 6. Obtain SSL certificate ----
echo ""
echo "[6/7] Obtaining SSL certificate for *.${DOMAIN}..."
certbot certonly \
    --manual \
    --preferred-challenges dns \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    -d "*.${DOMAIN}" \
    -d "${DOMAIN}" || echo "SSL setup deferred — run nginx/setup-ssl.sh manually"

(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab - 2>/dev/null || true
nginx -t 2>/dev/null && systemctl reload nginx || systemctl restart nginx

# ---- 7. Create systemd service ----
echo ""
echo "[7/7] Creating systemd service..."
cat > /etc/systemd/system/pinggy.service <<EOF
[Unit]
Description=pinggy Tunnel Service
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${APP_DIR}/.venv/bin/python ${APP_DIR}/run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pinggy
systemctl start pinggy

# ---- Firewall ----
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2222/tcp
ufw --force enable

# ---- Done ----
echo ""
echo "=========================================="
echo "  ✅ pinggy Deployed Successfully!"
echo "=========================================="
echo ""
echo "  Admin Panel:  https://${DOMAIN}/admin"
echo "  SSH Tunnel:   ssh -p 2222 -R0:localhost:PORT ${DOMAIN}"
echo "  Default:      admin / admin (change immediately!)"
echo ""
echo "  Commands:"
echo "    systemctl status pinggy"
echo "    journalctl -u pinggy -f"
echo ""
echo "=========================================="