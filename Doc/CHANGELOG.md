# CHANGELOG — pinggy (IRAGT)

## v0.11.0 — 2026-08-29 — Web Debugger v1: inspect + replay (Track 6)

### Added
- Request/response capture in the tunnel proxy (Redis ring buffer: last 100
  per tunnel, 1h TTL — ephemeral by design).
- /debugger/{sub}: list (owner-or-admin), clear, and replay (captured index or
  crafted request) endpoints.
- Dashboard Active Tunnels: 🔍 Debug inspector modal — capture table, expandable
  headers/body, per-row replay.
- `Doc/tests/v0.11.0/` evidence (live capture → replay → clear matrix).

### Changed
- none

### Removed
- none

## v0.10.0 — 2026-08-29 — API keys + management REST + Python SDK (Track 4)

### Added
- Migration 0020: `api_keys` (hashed at rest, shown once, last-used tracking).
- /apikeys lifecycle + /manage REST surface (tunnels list/stop, tokens CRUD)
  authenticated via X-Api-Key or Bearer JWT.
- `sdk/pinggy_sdk.py` — zero-dependency Python SDK (TunnelClient).
- Dashboard API Keys page (one-time key reveal, revoke, SDK quick-start).
- `Doc/tests/v0.10.0/` evidence (14 assertions incl. full SDK E2E).

### Changed
- `get_api_user` dependency handles dual auth (API key → JWT fallback).

### Removed
- none

## v0.9.0 — 2026-08-29 — persistent subdomains (Track 3)

### Added
- Migration 0019: `tokens.fixed_subdomain` (UNIQUE, backfilled from token hash —
  all existing token URLs instantly stable across reconnects).
- SSH tunnel setup honors the token's fixed subdomain (stale-session takeover
  instead of random regeneration on reconnect collision).
- PUT /tokens/{id} accepts fixed_subdomain (validated: 3-50 chars, lowercase
  alnum+hyphen, unique); GET /tokens returns it.
- Dashboard edit-token modal: fixed-subdomain field.
- `Doc/tests/v0.9.0/` evidence (7 assertions incl. double-connect stability).

### Changed
- none

### Removed
- none

## v0.8.0 — 2026-08-29 — tunnel security options + bandwidth widget (Tracks 2 & 8)

### Added
- Migration 0018: per-token security (basic auth, IP whitelist, API/bearer key,
  HTTPS-only) — all OFF by default; enforced in TunnelProxyMiddleware with
  constant-time compares and CIDR support; blocked requests counted + SSH-logged.
- PUT /tokens/{id} security fields ("auto" bearer generation, empty clears);
  masked security view on GET /tokens; audited (token.security entries).
- Dashboard edit-token modal 🔒 Security section.
- Subscription page Bandwidth Usage widget.
- `Doc/tests/v0.8.0/` evidence (9-assertion live proxy matrix + 2 screenshots).

### Changed
- TunnelSession carries the authenticating token (needed for proxy security
  lookups).

### Removed
- none

## v0.7.0 — 2026-08-29 — Command Builder 2.0 (roadmap Track 1)

### Added
- Migration 0017: `tunnel_configs` + /configs CRUD API (saved configurations).
- GET /tunnels/qr — SVG QR codes for tunnel URLs (authed).
- Configure page rebuilt: 16 app presets, SSH/Docker command tabs, download
  buttons (.sh/.bat/.command with optional auto-reconnect loop), QR code display,
  Save/Load named configurations, Auto-Reconnect toggle.
- `qrcode` dependency; `Doc/tests/v0.7.0/` evidence (5 assertions + 2 screenshots).

### Changed
- Dashboard Configure page drops the placeholder Tunnel-type/Region selects
  (disabled "soon" options) — real support lands with v1.0.0 TCP/TLS.

### Removed
- none

## v0.6.1 — 2026-08-29 — competitive analysis report (docs only)

### Added
- `Doc/reports/pinggy-competitive-analysis.md` — full page-by-page audit of
  dashboard.pinggy.io (9 pages + advanced options) vs our v0.6.0: feature matrix,
  UX comparison, 8-track prioritized roadmap (command builder 2.0 → TCP/TLS → web
  debugger) and version plan v0.7.0→v1.0.0.

### Changed
- none

### Removed
- none

## v0.6.0 — 2026-08-29 — Phase E: editable plans + invoice tracking

### Added
- Migration 0015: `plans` table (seeded free/pro/enterprise) — admin 💎 Plans editor
  (prices, features, tagline, CTA, visibility) with landing pricing now rendered
  dynamically from GET /api/v1/plans (Job 1).
- Migration 0016: `invoices` table. Invoices auto-generate when payments turn paid
  (idempotent); admin 🧾 Invoices view (stats + void + printable invoice page);
  user dashboard 🧾 My Invoices with print links (Job 8).
- `plans.py` + `invoices.py` routers; print endpoint (?token= auth, owner-or-admin).
- `Doc/tests/v0.6.0/` evidence (3 screenshots + 13 assertions).

### Changed
- `_mark_paid_and_upgrade` auto-creates the invoice after upgrade.
- Landing pricing section is DB-driven (static markup retained only as loading fallback).

### Removed
- Hardcoded Pro/Enterprise pricing cards in landing.html (now DB-driven via plans
  table; the hardcoded Free card remains only as the pre-fetch placeholder).

## v0.5.0 — 2026-08-29 — Phase D: email system + announcements + password reset

### Added
- Migration 0013: email_logs, password_resets, payments.coupon_code. Migration 0014:
  announcements.
- Email core (SMTP configurable at runtime in ⚙️ Settings; every send logged;
  graceful degradation when unconfigured).
- Forgot/reset password flow: API endpoints + login-page UI + ?reset=TOKEN deep
  link; single-use expiring tokens (SHA-256 hashed at rest).
- Trigger emails: welcome on signup, tunnel-stopped on SSH disconnect.
- 📣 Announcements: admin CRUD + publish form; user dashboard banner; campaign
  composer (all/pro/free audiences, SMTP-gated) + admin Email Logs view.
- `Doc/tests/v0.5.0/` evidence (3 screenshots + assertions).

### Changed
- admin.html: SMTP settings keys surfaced in ⚙️ Settings (masked password).

### Removed
- **Duplicate `let tunnelRateTracker` declaration in dashboard.html** (pre-existing
  bug inherited from the prod-server copy): a SyntaxError that prevented the ENTIRE
  user dashboard from ever loading. The dashboard now works (first time in this
  codebase's local history).

## v0.4.0 — 2026-08-29 — Phase C: payment-key settings UI + coupons

### Added
- Migration 0012: `app_settings` KV table + `coupons` table.
- ⚙️ Settings admin page: Stripe/PayPal/NowPayments API keys (masked, DB-stored,
  no restart needed), enable flags, prices, public base URL — env fallback preserved.
- 🎟️ Coupons: admin CRUD + create form; percent-off checkout discounts on all 3
  gateways; redemption counting; POST /payments/coupon/validate preview.
- `app/core/app_settings.py` settings store (DB > env resolution).
- `Doc/tests/v0.4.0/` evidence.

### Changed
- payments.py checkout path reads keys/URLs/mode/prices from the settings store;
  payments rows record coupon_code (defensively until the column exists).
- Coupons redeemed automatically when a payment is marked paid.

### Removed
- none

## v0.3.0 — 2026-08-29 — Phase B: per-token traffic + daily/monthly insights

### Added
- Migration 0011: `tunnels.token` column (+index, +backfill) linking tunnels to the
  token that created them.
- Per-token traffic: `/tokens` and `/tokens/admin/all` responses now include
  total_requests / total_bytes / active_tunnels; admin "All Tokens" table gained
  Requests / Data / Active Tunnels columns + total stat cards; user dashboard token
  table gained the same columns (Job 4).
- `GET /api/v1/analytics/overview` (admin): daily series (signups, tunnels, requests,
  revenue) + 12-month monthly series + today/this-month summary.
- Admin dashboard "📈 Insights" card: summary cards, Daily/Monthly tabs, 30/60/90-day
  range cycler, dependency-free CSS bar charts (Job 7).
- `Doc/tests/v0.3.0/` evidence (2 screenshots + assertions).

### Changed
- `tunnel_registry.increment_request_count` now writes counters through to the
  `tunnels` table (bug fix: previously in-memory only → all tunnel rows showed 0
  traffic forever; required for per-token stats and daily analytics).
- `ssh_server._setup_tunnel` records the authenticating token in the tunnels row.

### Removed
- none

## v0.2.0 — 2026-08-29 — Phase A: user management + account control + audit log + IP auto-block toggle

### Added
- Migration 0010: `users.is_active` (BOOLEAN, default TRUE) + `audit_logs` table (+down).
- `app/core/audit.py` fire-and-forget audit writer + `GET /api/v1/audit` + 📋 Audit Log
  admin page (newest-first, actor/action/target/details).
- Admin Users table: ✏️ Edit modal (email, full name, role, password reset) and
  🚫 Disable / ✅ Enable buttons with confirm dialogs; Disabled status badge.
- IP Monitor ⚙️ Config tab: Auto-Block ON/OFF switch + rate window / block threshold /
  block duration inputs — runtime (Redis overrides, no restart).
- `PUT /api/v1/ip-monitor/config`; GET now returns effective config + source.
- `Doc/tests/v0.2.0/` evidence (assertions + 3 screenshots).

### Changed
- Login (`POST /auth/login`), `get_current_user` (all authed APIs), and SSH token
  auth (both tokens-table and users-fallback paths) now reject accounts with
  is_active=false: login 403, API 403, SSH forward refused.
- `PUT /users/{id}` accepts `is_active`; UserOut exposes is_active.
- Middleware order swapped (admin-approved): IPMonitor now OUTERMOST — proxied
  tunnel traffic is IP-counted (previously invisible to the monitor).
- `record_request` uses runtime config (window/threshold/duration/auto-block toggle).

### Removed
- none

## v0.1.3 — 2026-08-29 — Job 0: three parked suggestions

### Added
- `loadSystemInfo()` in admin.html — System Info table now settings-driven via
  GET /tunnels/info (SSH server + tunnel domain cells, was hardcoded prod values).
- `Doc/tests/v0.1.3/` — evidence incl. fresh-DB seed test + System Info screenshot.

### Changed
- `app/main.py` middleware comment now documents the REAL Starlette order
  (last added = outermost; TunnelProxy intercepts before IPMonitor counts).
- `app/core/auto_setup.py` `_ensure_default_admin` also inserts the seeded token
  into `tokens` (idempotent) — fresh installs no longer start with an empty
  tokens table.
- `Doc/database.md`, `Doc/process-flow.md` — quirk notes updated accordingly.

### Removed
- none

## v0.1.2 — 2026-08-29 — docs drift fix: complete tunnels route inventory
Docs-only fix found via drift check (§11): server log showed /tunnels/history serving
200 while docs listed only 3 of the tunnels router's 7 routes.

### Added
- `Doc/tests/v0.1.2/` — drift-fix evidence (authoritative route inventory + live
  curl assertions for the previously-missed routes).

### Changed
- `Doc/process-flow.md` API table: tunnels row now lists all 7 routes with auth notes.
- `Doc/functions.md`: tunnels section expanded to 7 rows with decorator line numbers.
- `Doc/page-map.md`: /admin endpoints += GET /tunnels/history + DELETE /tunnels/{sub};
  /dashboard endpoints += GET /tunnels/my + POST /tunnels/{sub}/stop.

### Removed
- none

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
