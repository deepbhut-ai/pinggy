#!/bin/bash
# ============================================================
# Fleet SSL — Provision DNS A records + Let's Encrypt certs
#   for all 33 callingagents.in fleet subdomains
# ============================================================
#
# PREREQUISITE: Cloudflare A records must exist for each subdomain
# pointing to 13.140.131.204 (DNS-only, not proxied).
#
# This script:
#   1. Checks DNS for each subdomain
#   2. For subs with DNS → requests LE cert via HTTP-01 challenge
#   3. For subs with a new cert → generates per-subdomain nginx 443 config
#   4. Reloads nginx gracefully
#
# Usage:
#   bash /opt/iragt/scripts/provision_fleet_ssl.sh
#
# To create DNS records in Cloudflare, use:
#   bash /opt/iragt/scripts/create_cf_dns_records.sh <CF_API_TOKEN>
# ============================================================

set -euo pipefail

SERVER_IP="13.140.131.204"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
WEBROOT="/var/www/certbot"
EMAIL="support@callingagents.in"

# All 33 fleet subdomains
SUBDOMAINS=(
  astrology socialvibe eclassify infixlms yoori1 infyhms rith acelle
  teleman magicai erpgo cloudoffice infycare maildoll stackposts jobpilot
  phprank instikit bedrive zillapage phpanalytics yoori2 activeecom whatsmark
  larabuilder xerochat unimatrix wowonder quickdate1 quickdate2 architect
  porto webifly
)

echo "=========================================="
echo "  Fleet SSL Provisioning — $(date)"
echo "  Server IP: $SERVER_IP"
echo "  Subdomains: ${#SUBDOMAINS[@]}"
echo "=========================================="

mkdir -p "$WEBROOT/.well-known/acme-challenge"

has_dns=0
has_cert=0
needs_cert=0
needs_nginx=0

for sub in "${SUBDOMAINS[@]}"; do
  domain="${sub}.callingagents.in"
  echo ""
  echo "--- $domain ---"

  # 1. Check DNS
  ip=$(dig +short "$domain" A 2>/dev/null | tail -1)
  if [ -z "$ip" ]; then
    echo "  ❌ No DNS A record — skip (add in Cloudflare first)"
    continue
  fi
  if [ "$ip" != "$SERVER_IP" ]; then
    echo "  ⚠️  DNS points to $ip (not $SERVER_IP) — skip"
    continue
  fi
  echo "  ✅ DNS OK → $ip"
  has_dns=$((has_dns + 1))

  # 2. Check if LE cert already exists
  cert_dir="/etc/letsencrypt/live/${domain}"
  if [ -f "$cert_dir/fullchain.pem" ]; then
    echo "  ✅ LE cert already exists"
    has_cert=$((has_cert + 1))
  else
    # 3. Request cert via HTTP-01
    echo "  🔄 Requesting LE cert via HTTP-01..."
    if certbot certonly \
      --webroot -w "$WEBROOT" \
      -d "$domain" \
      --non-interactive \
      --agree-tos \
      --email "$EMAIL" \
      --keep-until-expiring \
      2>&1 | grep -q "Successfully received certificate"; then
      echo "  ✅ LE cert obtained"
      needs_cert=$((needs_cert + 1))
    else
      echo "  ❌ Certbot failed — check /var/log/letsencrypt/letsencrypt.log"
      continue
    fi
  fi

  # 4. Generate per-subdomain nginx 443 config
  nginx_conf="${NGINX_SITES_AVAILABLE}/custom-${domain}"
  if [ ! -f "$nginx_conf" ]; then
    echo "  🔄 Creating nginx config..."
    cat > "$nginx_conf" << NGINX_CONF
# HTTPS for ${domain} — managed by provision_fleet_ssl.sh
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};

    ssl_certificate     ${cert_dir}/fullchain.pem;
    ssl_certificate_key ${cert_dir}/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=31536000" always;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 30s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }

    access_log /var/log/nginx/fleet_${sub}_ssl_access.log;
    error_log /var/log/nginx/fleet_${sub}_ssl_error.log;
}
NGINX_CONF
    ln -sf "$nginx_conf" "${NGINX_SITES_ENABLED}/custom-${domain}"
    echo "  ✅ Nginx config created + symlinked"
    needs_nginx=$((needs_nginx + 1))
  else
    echo "  ✅ Nginx config already exists"
  fi
done

echo ""
echo "=========================================="
echo "  Summary"
echo "  DNS OK:      $has_dns / ${#SUBDOMAINS[@]}"
echo "  Existing LE: $has_cert"
echo "  New certs:   $needs_cert"
echo "  New nginx:   $needs_nginx"
echo "=========================================="

if [ $needs_nginx -gt 0 ] || [ $needs_cert -gt 0 ]; then
  echo ""
  echo "Testing nginx config..."
  if nginx -t 2>&1; then
    echo "Reloading nginx..."
    nginx -s reload 2>&1
    echo "✅ nginx reloaded"
  else
    echo "❌ nginx config test FAILED — not reloading"
    exit 1
  fi
fi

echo ""
echo "Done. Subs without DNS need A records in Cloudflare first."
echo "Run: bash /opt/iragt/scripts/create_cf_dns_records.sh <CF_API_TOKEN>"