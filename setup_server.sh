#!/bin/bash
set -e

cd /opt/iragt

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
cat > /etc/systemd/system/iragt.service << 'EOF'
[Unit]
Description=IRAGT SSH Tunnel Service
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/iragt
EnvironmentFile=/opt/iragt/.env
ExecStart=/opt/iragt/.venv/bin/python /opt/iragt/run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
echo "✅ systemd service created"

echo "=== Enabling and starting service ==="
systemctl daemon-reload
systemctl enable iragt
systemctl start iragt
sleep 3
systemctl status iragt --no-pager || true
echo "✅ Service started"

echo "=== Creating nginx config ==="
cat > /etc/nginx/sites-available/iragt << 'NGINX'
# IRAGT tunnel service — admin panel + API
server {
    listen 80;
    server_name iragt.indicatorleads.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    access_log /var/log/nginx/iragt_access.log;
    error_log /var/log/nginx/iragt_error.log;
}

# IRAGT tunnel subdomains — wildcard for *.iragt.indicatorleads.com
server {
    listen 80 default_server;
    server_name ~^.+\.iragt\.indicatorleads\.com$;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    access_log /var/log/nginx/iragt_tunnel_access.log;
    error_log /var/log/nginx/iragt_tunnel_error.log;
}
NGINX
echo "✅ nginx config created"

echo "=== Enabling nginx site ==="
ln -sf /etc/nginx/sites-available/iragt /etc/nginx/sites-enabled/iragt
nginx -t
systemctl reload nginx
echo "✅ nginx reloaded"

echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo "Admin panel: http://13.140.131.204:8000/admin"
echo "SSH tunnel:  ssh -p 2222 -R0:localhost:PORT TOKEN@13.140.131.204"
echo "Service:     systemctl status iragt"
echo "Logs:        journalctl -u iragt -f"