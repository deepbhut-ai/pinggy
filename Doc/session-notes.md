# Session notes — IRAGT (pinggy)

## 2026-08-29 — local run in VS Code browser
- **Done:** project runs locally at http://127.0.0.1:8020 (APP_PORT=8020 env override;
  8000/8010/8030 occupied by other processes). Rebuilt `.venv` for macOS (shipped one was
  Linux/ELF from prod server copy). Local Postgres `postgres:root` + Redis reused as-is;
  auto-setup created DB `pinggy`, ran migrations 0001–0009, seeded admin/admin.
  Verified in integrated browser: landing, /login, /admin dashboard (logged in as admin).
  Evidence: `Doc/tests/v0.1.0/output.txt` + 2 screenshots. NO code changed.
- **In progress / half-done:** server still running in background terminal
  (id 6e5a010b-9854-4b48-a223-a0e32cded055, `APP_PORT=8020 .venv/bin/python run.py`).
- **Next:** user decides — e.g. scaffold full Doc/ set + `git init` + baseline v0.1.0
  commit (suggested, not done), or test tunnel flow locally.
- **Watch out:** project has NO git repo (Doc/ has no history to recover — flagged to user);
  `.env` is prod config; `GET /api/v1/users/me` doesn't exist (500s — use UUID);
  port 8000 on this Mac is held by a node process.

## 2026-08-29 — v0.1.0 (user approved all 3 suggestions)
- **Done:** v0.1.0 committed + tagged — (1) git repo initialized (secrets ignored, Doc/ tracked);
  (2) `.env` switched to LOCAL DEV config (port 8020, TUNNEL_DOMAIN=localhost:8020, payments off,
  prod values verified-preserved in `.env.production`); (3) local-DB admin re-identified to
  support@callingagents.in / Calling@2025_26 (FK-safe tx; old admin/admin → 401). Full Doc/
  scaffold written (process-flow, database, functions, page-map, pages, impact-map, migrations,
  guides/setup, CHANGELOG). Tunnel E2E PASSES locally (Doc/tests/v0.1.0/tunnel_e2e.py).
- **In progress:** app running in terminal a27c0a0c-0fe2-4319-89f8-6134b6af708a (dev env, port 8020).
- **Next:** nothing pending — await user's next task. Ideas parked as suggestions only:
  backfill admin into tokens table; fix hardcoded iraglobaltech.com strings in admin.html.
- **Watch out:** E2E fetch must use a worker thread (blocking urlopen deadlocks the SSH forward);
  tokens table empty locally (backfill ran before admin seed); changing users.email requires
  re-linking tokens rows (FK tokens.user_email → users.email).

