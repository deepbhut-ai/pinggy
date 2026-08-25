#!/bin/bash
# ============================================================
# pinggy — One-Command Docker Production Setup
#
# On a fresh Ubuntu 22.04+ server:
#   git clone <repo> /opt/pinggy && cd /opt/pinggy && bash setup.sh
# ============================================================

set -e

DOMAIN="iraglobaltech.com"
APP_DIR="/opt/pinggy"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  pinggy — Docker Production Setup                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ---- 1. Install Docker ----
echo "📦 [1/4] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "  ✅ Docker installed"
else
  echo "  ✅ Docker already installed"
fi

# ---- 2. Check Docker Compose ----
echo "🔧 [2/4] Checking Docker Compose..."
if docker compose version &> /dev/null; then
  echo "  ✅ Docker Compose available"
else
  echo "  ❌ Docker Compose not found. Please install it manually."
  exit 1
fi

# ---- 3. Setup .env ----
echo "⚙️  [3/4] Creating .env..."
cd "$APP_DIR"
if [ ! -f .env ]; then
  cp .env.docker .env
  JWT=$(openssl rand -hex 32)
  sed -i "s/change-me-to-a-random-string/$JWT/" .env
  echo "  ✅ .env created — edit it to set your domain and payment keys"
else
  echo "  ✅ .env already exists"
fi

# ---- 4. Build & Start ----
echo "🚀 [4/4] Building and starting containers..."
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

echo "  Waiting for app to start..."
sleep 15

if docker compose -f docker-compose.prod.yml ps | grep -q "Up\|running"; then
  echo "  ✅ Containers are running!"
else
  echo "  ❌ Containers failed. Check: docker compose -f docker-compose.prod.yml logs"
  docker compose -f docker-compose.prod.yml logs --tail=20
  exit 1
fi

# ---- Create admin user ----
echo ""
echo "👤 Creating admin user..."
docker compose -f docker-compose.prod.yml exec app python -c "
import psycopg, secrets
from passlib.hash import bcrypt
conn = psycopg.connect('host=db dbname=pinggy user=pinggy password=pinggy_secret')
cur = conn.cursor()
cur.execute('SELECT id FROM users WHERE email = %s', ('admin',))
if not cur.fetchone():
    token = secrets.token_hex(8)
    cur.execute('INSERT INTO users (email, password_hash, full_name, role, tunnel_token, plan) VALUES (%s, %s, %s, %s, %s, %s)', ('admin', bcrypt.hash('admin'), 'Default Admin', 'admin', token, 'free'))
    conn.commit()
    print(f'  Admin created: admin / admin (token: {token})')
else:
    print('  Admin already exists')
cur.close()
conn.close()
" 2>/dev/null || echo "  ⚠️  Run this later to create admin"

# ---- Summary ----
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ pinggy production setup complete!                 ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  App:        http://$SERVER_IP:8000                 "
echo "║  SSH:        ssh -p 2222 ...@$SERVER_IP             "
echo "║  Admin:      admin / admin                          "
echo "║                                                      ║"
echo "║  Next steps:                                         ║"
echo "║  1. Edit .env: set DOMAIN and payment keys          "
echo "║  2. Restart: docker compose -f docker-compose.prod.yml restart"
echo "║  3. DNS: domain → $SERVER_IP (Cloudflare Proxied)  "
echo "║  4. DNS: ssh.domain → $SERVER_IP (DNS only)        "
echo "║  5. Cloudflare SSL: Flexible mode                   ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Commands:"
echo "  docker compose -f docker-compose.prod.yml logs -f   # Logs"
echo "  docker compose -f docker-compose.prod.yml restart   # Restart"
echo "  docker compose -f docker-compose.prod.yml down      # Stop"
echo "  docker compose -f docker-compose.prod.yml up -d     # Start"
echo ""