#!/usr/bin/env bash
# ==============================================================================
# pinggy — One-Time Automated SSL & Certbot Webroot System Setup
# ==============================================================================
# Usage (run as root on production server):
#   sudo bash scripts/setup_ssl_system.sh
# ==============================================================================

set -Eeuo pipefail

echo "=========================================================="
echo "  Setting up Automatic SSL System (Certbot + Nginx)"
echo "=========================================================="

# 1. Ensure Certbot is installed
if ! command -v certbot >/dev/null 2>&1; then
    echo "==> Installing Certbot and Nginx plugin..."
    apt-get update -y
    apt-get install -y certbot python3-certbot-nginx
    echo "✅ Certbot installed."
else
    echo "✅ Certbot is already installed ($(certbot --version 2>&1 | head -n 1))"
fi

# 2. Create webroot directory for Let's Encrypt HTTP-01 verification
WEBROOT_DIR="/var/www/certbot"
echo "==> Ensuring webroot directory exists: $WEBROOT_DIR"
mkdir -p "${WEBROOT_DIR}/.well-known/acme-challenge"
chmod -R 755 "$WEBROOT_DIR"
chown -R www-data:www-data "$WEBROOT_DIR" 2>/dev/null || true
echo "✅ Webroot directory ready: $WEBROOT_DIR"

# 3. Ensure Nginx sites-available and sites-enabled directories exist
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

# 4. Configure auto-renewal cron job
echo "==> Configuring Certbot auto-renewal cron..."
CRON_JOB="0 3 * * * certbot renew --quiet --post-hook 'nginx -t && nginx -s reload'"

# Check if cron job is already present
if crontab -l 2>/dev/null | grep -Fq "certbot renew"; then
    echo "✅ Auto-renewal cron job is already configured."
else
    (crontab -l 2>/dev/null || true; echo "$CRON_JOB") | crontab -
    echo "✅ Daily auto-renewal cron job installed (runs daily at 3:00 AM with graceful Nginx reload)."
fi

# 5. Test Nginx and reload
if command -v nginx >/dev/null 2>&1; then
    echo "==> Testing Nginx configuration..."
    if nginx -t; then
        echo "==> Reloading Nginx gracefully..."
        nginx -s reload || systemctl reload nginx
        echo "✅ Nginx reloaded successfully."
    else
        echo "⚠️ Nginx test failed — please check /etc/nginx configuration."
    fi
fi

echo ""
echo "=========================================================="
echo "  ✅ Automatic SSL System Setup Complete!"
echo "  Webroot: $WEBROOT_DIR"
echo "  Custom Nginx configs: /etc/nginx/sites-available/custom-*"
echo "=========================================================="
