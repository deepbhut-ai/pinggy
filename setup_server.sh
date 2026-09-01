#!/bin/bash
set -e

cd /opt/pinggy

echo "=== Copying production env ==="
cp .env.production .env
echo "✅ .env ready"

echo "=== Creating Python venv ==="
python3 -m venv .venv
echo "✅ venv created"

echo "=== Installing dependencies ==="
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
echo "✅ Dependencies installed"

echo "=== Cleaning pycache ==="
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
echo "✅ Cleaned"

echo "=== Testing startup ==="
.venv/bin/python -c "from app.main import app; print('App imports OK')"
echo "✅ App imports work"

echo "=== Creating systemd service ==="
cat > /etc/systemd/system/pinggy.service << 'EOF'
[Unit]
Description=pinggy SSH Tunnel Service
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pinggy
EnvironmentFile=/opt/pinggy/.env
ExecStart=/opt/pinggy/.venv/bin/python /opt/pinggy/run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
echo "✅ systemd service created"

echo "=== Enabling and starting service ==="
systemctl daemon-reload
systemctl enable pinggy
systemctl start pinggy
sleep 3
systemctl status pinggy --no-pager || true
echo "✅ Service started"

echo "=== Creating nginx config ==="
cat > /etc/nginx/sites-available/pinggy << 'NGINX'
# pinggy tunnel service — admin panel + API
server {
    listen 80;
    server_name pinggy.indicatorleads.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    access_log /var/log/nginx/pinggy_access.log;
    error_log /var/log/nginx/pinggy_error.log;
}

# pinggy tunnel subdomains — wildcard for *.pinggy.indicatorleads.com
server {
    listen 80 default_server;
    server_name ~^.+\.pinggy\.indicatorleads\.com$;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    access_log /var/log/nginx/pinggy_tunnel_access.log;
    error_log /var/log/nginx/pinggy_tunnel_error.log;
}
NGINX
echo "✅ nginx config created"

echo "=== Enabling nginx site ==="
ln -sf /etc/nginx/sites-available/pinggy /etc/nginx/sites-enabled/pinggy
nginx -t
systemctl reload nginx
echo "✅ nginx reloaded"

echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo "Admin panel: http://13.140.131.204:8000/admin"
echo "SSH tunnel:  ssh -p 2222 -R0:localhost:PORT TOKEN@13.140.131.204"
echo "Service:     systemctl status pinggy"
echo "Logs:        journalctl -u pinggy -f"