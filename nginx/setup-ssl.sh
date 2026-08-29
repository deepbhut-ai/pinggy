#!/bin/bash
# ============================================================
# pinggy — SSL Certificate Setup (Let's Encrypt wildcard)
# ============================================================
# Run on the production server as root/sudo.
#
# This script obtains a wildcard SSL certificate for *.xyz.com
# using the DNS-01 challenge (required for wildcard certs).
#
# Prerequisites:
#   - Domain xyz.com pointing to this server's IP
#   - certbot installed: sudo apt install certbot python3-certbot-nginx
#   - DNS provider API access (Cloudflare, Route53, etc.)
#     OR ability to manually add TXT records
#
# Usage:
#   sudo bash setup-ssl.sh xyz.com admin@xyz.com
# ============================================================

set -e

DOMAIN="${1:-xyz.com}"
EMAIL="${2:-admin@${DOMAIN}}"

echo "=========================================="
echo "  pinggy SSL Setup"
echo "  Domain: *.${DOMAIN}"
echo "  Email:  ${EMAIL}"
echo "=========================================="

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    apt update -y
    apt install -y certbot python3-certbot-nginx
fi

# Create webroot for HTTP challenge
mkdir -p /var/www/certbot

# ---- Obtain wildcard certificate via DNS challenge ----
echo ""
echo "Obtaining wildcard certificate for *.${DOMAIN}..."
echo "This uses DNS-01 challenge — you'll need to add a TXT record."
echo ""

certbot certonly \
    --manual \
    --preferred-challenges dns \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    -d "*.${DOMAIN}" \
    -d "${DOMAIN}"

echo ""
echo "✅ SSL certificate obtained successfully!"
echo "   Cert: /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
echo "   Key:  /etc/letsencrypt/live/${DOMAIN}/privkey.pem"
echo ""

# ---- Set up auto-renewal ----
echo "Setting up auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
echo "✅ Auto-renewal configured (runs daily at 3 AM)"

echo ""
echo "=========================================="
echo "  SSL Setup Complete!"
echo "=========================================="