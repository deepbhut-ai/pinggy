# IRAGT Production Deploy Runbook (v1.14.0)

Target: Ubuntu server (13.140.131.204), Postgres + Redis on host, nginx in front.

## What ships (v1.3.0 → v1.14.0)
Branding, teams + role control, tickets, 2FA email OTP, API keys (caps + expiry),
unified Domains page, multi-port tunnels, WebSocket tunnels, DDoS/API rate-limit
shield with auto-ban, JWT refresh, security headers, audit CSV, DB backups,
SDK supervisor, Remote Devices, weekly digest, team activity feed.
Migrations 0001–0025 auto-apply on first boot (auto_setup).

## Steps

1. **Push code to the server**
   ```bash
   rsync -av --exclude .venv --exclude backups --exclude .git \
     ./ user@13.140.131.204:/opt/pinggy/
   # (or git pull if the server tracks the repo; tag: v1.14.0)
   ```

2. **Prepare .env** (on server, /opt/pinggy/.env)
   - Set a strong `JWT_SECRET` (openssl rand -hex 32)
   - `APP_ENV=production`, correct `TUNNEL_DOMAIN`, DB + Redis URLs
   - SMTP settings for 2FA OTP / digest emails

3. **First install only**
   ```bash
   cd /opt/pinggy && bash setup_server.sh
   sudo cp deploy/pinggy.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now pinggy
   ```
   Watch migrations apply: `journalctl -u pinggy -f | grep alembic`
   (expect `Running upgrade ... -> 0025`)

4. **Existing install (update)**
   ```bash
   cd /opt/pinggy
   .venv/bin/pip install -r requirements.txt   # if changed
   sudo systemctl restart pinggy
   ```

5. **Backups cron**
   ```bash
   crontab -e
   0 3 * * * cd /opt/pinggy && ./scripts/backup_db.sh >> /var/log/iragt-backup.log 2>&1
   ```

6. **Verify**
   ```bash
   curl -s https://<domain>/health                 # {"app":"IRAGT"}
   ssh -p 2222 -R0:localhost:8080 TOKEN@<host>      # tunnel banner shows IRAGT
   # login → 2FA OTP arrives by email; wrong code ×3 → IP auto-banned 1h
   # hammer API 70x/min → 429 at 61 (shield active)
   ```

7. **nginx**: configs in nginx/ (rate-limit presets in pinggy-rate-limits.conf);
   enable SSL via nginx/setup-ssl.sh.

## Rollback
```bash
git checkout v1.13.0 && sudo systemctl restart pinggy
# DB migrations 0023–0025 are additive; leaving them applied is safe for older code
# (new columns default NULL/FALSE). For full revert see Doc/migrations.md down sections.
```
