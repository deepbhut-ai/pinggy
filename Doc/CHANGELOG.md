# CHANGELOG — pinggy (IRAGT)

## v0.1.1 — 2026-08-29 — backfill admin tunnel token into tokens table
Data-only local-DB change (approved suggestion 1 of 3 from v0.1.0 report).

### Added
- `Doc/tests/v0.1.1/` — verification evidence (admin API token list, E2E re-run,
  All Tokens dashboard screenshot).

### Changed
- Local DB `tokens` table: inserted the admin's existing tunnel token (name "Default",
  user support@callingagents.in) via idempotent upsert — the admin dashboard "All
  Tokens" view is no longer empty and SSH auth now resolves through the tokens table
  (primary path) instead of the users.tunnel_token fallback. LOCAL DATABASE ONLY.
- `Doc/database.md` — tokens-table row count + fresh-install quirk note updated.

### Removed
- none

## v0.1.0 — 2026-08-29 — baseline: local dev bootstrap + full Doc/ scaffold
First versioned commit of this repository (git initialized this day; project previously
existed un-versioned as a copy of the production server tree).

### Added
- Full `Doc/` living-documentation set: process-flow.md, database.md, functions.md,
  page-map.md (master), pages.md (thin), impact-map.md, migrations.md, guides/setup.md,
  session-notes.md, tests/v0.1.0/ (curl assertions + screenshots + tunnel E2E script).
- `Doc/tests/v0.1.0/tunnel_e2e.py` — scripted local SSH-tunnel end-to-end test
  (http.server 9090 → SSH reverse tunnel → subdomain URL fetch).
- Dev `.env` values documented in guides/setup.md (port 8020, *.localhost tunnels).

### Changed
- `.env` is now the LOCAL DEV config: APP_ENV=dev, APP_DEBUG=true, APP_PORT=8020,
  TUNNEL_DOMAIN=localhost:8020, PROXY_PORT=8020, PUBLIC_BASE_URL=http://127.0.0.1:8020,
  dev-only JWT secret, all payment providers DISABLED. (Production values were already
  preserved verbatim in `.env.production` — verified by diff before overwrite.)
- Local DB admin identity re-identified: users.email 'admin' → support@callingagents.in,
  bcrypt password set (was default admin/admin), tokens/tunnel rows re-linked in one
  transaction (FK-safe). LOCAL DATABASE ONLY — production DB on the server untouched.
- `.venv` rebuilt for macOS (shipped one contained Linux ELF binaries from the prod
  server copy; unusable on macOS). `.venv` is gitignored.

### Removed
- Production values from the active `.env` (APP_ENV=production, TUNNEL_DOMAIN=
  iraglobaltech.com, PROXY_PORT=8000, JWT prod secret, fake payment keys sk_test_xxx /
  PayPal xxx / NowPayments xxx with *_ENABLED=true). Nothing deleted outright — the
  exact production configuration remains available in `.env.production`.
- No code files, routes, tables, or columns removed.
