# guides/setup.md — run pinggy locally (macOS, VS Code)

## Prereqs (already true on this machine)
- PostgreSQL 14 running (brew services, port 5432, user postgres / password root)
- Redis running on 6379
- Python 3.10+

## One-time
```bash
cd /Volumes/Storage/DRIVE/IRAGT
python3 -m venv .venv            # NEVER copy a .venv from the Linux server — ELF binaries won't run
.venv/bin/pip install -r requirements.txt
```
`.env` is the LOCAL DEV config (APP_ENV=dev, port 8020, TUNNEL_DOMAIN=localhost:8020,
payments disabled). Production values are preserved in `.env.production` — to deploy,
copy that over `.env` on the server (deploy/pinggy.service + setup_server.sh).

## Run
```bash
.venv/bin/python run.py          # → http://127.0.0.1:8020
```
First start auto-creates DB `pinggy`, runs all migrations, seeds an admin.

Ports: app 8020 (8000/8010/8030 are taken by other apps on this Mac), SSH tunnel
server 2222. If 8020 is busy: `APP_PORT=8021 .venv/bin/python run.py` (env var beats .env).

## Admin login (local)
- Email: support@callingagents.in
- Password: Calling@2025_26
(role=admin; re-identified from the auto-setup default admin/admin in v0.1.0 —
LOCAL DB only, production DB untouched.)

## Test a tunnel end-to-end
```bash
# terminal 1 — something to expose
.venv/bin/python -m http.server 9090

# terminal 2 — open the tunnel (username = admin's tunnel token from dashboard or DB)
TOKEN=$(psql "postgresql://postgres:root@localhost:5432/pinggy" -tAc \
  "SELECT tunnel_token FROM users WHERE email='support@callingagents.in'")
ssh -p 2222 -R0:localhost:9090 "$TOKEN"@localhost
# banner prints the URL, e.g. http://abc1234.localhost:8020

# terminal 3 — browse it
open http://<subdomain>.localhost:8020
```
*.localhost resolves to 127.0.0.1 on macOS. Or run the scripted E2E:
`Doc/tests/v0.1.0/tunnel_e2e.py` (see Doc/tests/v0.1.0/output.txt).

## Common gotchas
- Linux `.venv` in a server copy → `permission denied` on macOS → rebuild it.
- `GET /api/v1/users/me` does NOT exist (500s — `{user_id}` treats "me" as UUID).
  Use `GET /api/v1/auth/me`.
- Changing a user's email: tokens.user_email has an FK to users(email) — re-link token
  rows in the same transaction (see database.md).
- Restart the app after editing `.env` (uvicorn loads it once at boot).
