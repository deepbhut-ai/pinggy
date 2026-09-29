#!/usr/bin/env bash
# ==============================================================================
# IRAGT Edge Node Automated Bootstrap & Setup
# ==============================================================================
#
# Usage:
#   curl -sSL https://iraglobaltech.com/edge/setup.sh | bash -s -- \
#     --controller https://iraglobaltech.com \
#     --token <NODE_SECRET> \
#     --region <REGION_CODE>
#
# ==============================================================================

set -e

# Default settings
CONTROLLER_URL="https://iraglobaltech.com"
NODE_SECRET=""
REGION_CODE=""
PROXY_DOMAIN=""
SSH_PORT="2222"
HTTP_PORT="80"

# Parse arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --controller) CONTROLLER_URL="$2"; shift ;;
    --token) NODE_SECRET="$2"; shift ;;
    --region) REGION_CODE="$2"; shift ;;
    --domain) PROXY_DOMAIN="$2"; shift ;;
    --ssh-port) SSH_PORT="$2"; shift ;;
    --http-port) HTTP_PORT="$2"; shift ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

CONTROLLER_URL="${CONTROLLER_URL%/}"

if [ -z "$NODE_SECRET" ] || [ -z "$REGION_CODE" ]; then
  echo ""
  echo "❌ Error: Missing required arguments."
  echo "Usage: curl -sSL ${CONTROLLER_URL}/edge/setup.sh | bash -s -- --token <NODE_SECRET> --region <REGION_CODE>"
  echo ""
  exit 1
fi

# 0. Check root permissions
if [ "$EUID" -ne 0 ]; then
  echo ""
  echo "❌ Error: This setup script must be run as root (or with sudo)."
  echo "Please run: sudo bash -c \"curl -sSL ${CONTROLLER_URL}/edge/setup.sh | bash -s -- ...\""
  echo ""
  exit 1
fi

if [ -z "$PROXY_DOMAIN" ]; then
  PROXY_DOMAIN="${REGION_CODE}.iraglobaltech.com"
fi

echo ""
echo "🚀 =================================================================="
echo "   IRAGT EDGE NODE INSTALLER — REGION [${REGION_CODE^^}]"
echo "=================================================================="
echo ""

# 1. Detect Public IP
echo "🔍 Detecting public IP address..."
SERVER_IP=$(curl -sSL4 --max-time 5 https://ifconfig.me 2>/dev/null || curl -sSL4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

if [ -z "$SERVER_IP" ]; then
  echo "❌ Failed to detect public IP address."
  exit 1
fi
echo "   Detected Public IP: $SERVER_IP"

# 2. Check for port conflicts (default Apache2 or Nginx on fresh VPS)
if ss -tuln 2>/dev/null | grep -q ":${HTTP_PORT} "; then
  echo "⚠️  Port ${HTTP_PORT} is in use by another process."
  if systemctl is-active --quiet apache2 2>/dev/null; then
    echo "   Stopping and disabling default Apache2 web server to free port ${HTTP_PORT}..."
    systemctl stop apache2 || true
    systemctl disable apache2 || true
  elif systemctl is-active --quiet nginx 2>/dev/null; then
    echo "   Note: Nginx is active on port ${HTTP_PORT}. iragt-edge will need this port."
  fi
fi

# 3. Configure UFW firewall if active
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "🛡️  Configuring UFW rules for SSH port ${SSH_PORT} and HTTP port ${HTTP_PORT}..."
  ufw allow ${SSH_PORT}/tcp >/dev/null 2>&1 || true
  ufw allow ${HTTP_PORT}/tcp >/dev/null 2>&1 || true
fi

# 4. Install dependencies
echo "📦 Installing system packages & Python environment..."
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq python3 python3-pip python3-venv curl
elif command -v yum >/dev/null 2>&1; then
  yum install -y -q python3 python3-pip curl
fi

mkdir -p /opt/iragt-edge
mkdir -p /etc/iragt-edge

if [ ! -d "/opt/iragt-edge/.venv" ]; then
  python3 -m venv /opt/iragt-edge/.venv
fi

echo "📦 Installing edge daemon libraries (asyncssh, httpx, aiohttp)..."
/opt/iragt-edge/.venv/bin/pip install --upgrade -q pip
/opt/iragt-edge/.venv/bin/pip install -q asyncssh httpx aiohttp

# 5. Download edge daemon code
echo "⬇️  Downloading edge daemon from controller..."
curl -sSL "${CONTROLLER_URL}/edge/daemon.py" -o /opt/iragt-edge/edge_daemon.py
chmod +x /opt/iragt-edge/edge_daemon.py

# 6. Register with Controller & Sync Cloudflare DNS
echo "🔗 Registering edge node with ${CONTROLLER_URL}..."
REGISTER_PAYLOAD=$(cat <<EOF
{
  "region_code": "$REGION_CODE",
  "node_secret": "$NODE_SECRET",
  "server_ip": "$SERVER_IP",
  "ssh_port": $SSH_PORT,
  "proxy_domain": "$PROXY_DOMAIN"
}
EOF
)

REG_RESP=$(curl -sSL -X POST "${CONTROLLER_URL}/api/v1/edge/register" \
  -H "Content-Type: application/json" \
  -d "$REGISTER_PAYLOAD")

if echo "$REG_RESP" | grep -q '"status":"success"'; then
  echo "   ✅ Node successfully registered and synchronized!"
else
  echo "   ⚠️ Registration warning/error: $REG_RESP"
fi

# 5. Create systemd service
echo "⚙️  Configuring systemd service (iragt-edge.service)..."
cat <<EOF > /etc/systemd/system/iragt-edge.service
[Unit]
Description=IRAGT Multi-Region Edge Node (${REGION_CODE^^})
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/iragt-edge
ExecStart=/opt/iragt-edge/.venv/bin/python /opt/iragt-edge/edge_daemon.py \\
  --controller ${CONTROLLER_URL} \\
  --token ${NODE_SECRET} \\
  --region ${REGION_CODE} \\
  --domain ${PROXY_DOMAIN} \\
  --ssh-port ${SSH_PORT} \\
  --http-port ${HTTP_PORT}
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# 6. Enable and start service
echo "🚀 Starting iragt-edge daemon..."
systemctl daemon-reload
systemctl enable --now iragt-edge

echo ""
echo "✅ =================================================================="
echo "   IRAGT EDGE NODE [${REGION_CODE^^}] INSTALLED & RUNNING!"
echo "=================================================================="
echo "   Public IP:      $SERVER_IP"
echo "   SSH Endpoint:   ${REGION_CODE}.ssh.iraglobaltech.com:${SSH_PORT}"
echo "   Wildcard Proxy: *.${PROXY_DOMAIN}"
echo "   Status:         systemctl status iragt-edge"
echo "=================================================================="
echo ""
