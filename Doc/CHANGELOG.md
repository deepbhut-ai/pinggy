# CHANGELOG — IRAGT (formerly pinggy)

## v2.0.0 — 2026-09-01 — Remove Enterprise plan

### Added
- Reversible Alembic migration `0026_remove_enterprise_plan.py`.

### Changed
- Pricing now contains only Free and Pro plans.
- Landing-page pricing logic no longer contains Enterprise-specific behavior.

### Removed
- Enterprise plan row from the `plans` table because the product now offers only Free and Pro.
- Enterprise-specific pricing and contact-sales link logic from the landing page.

## v1.14.1 — 2026-09-01 — Pull latest teammate code

### Added
- Latest `origin/main` application features and migrations through v1.14.0.
- Deployment verification evidence in `Doc/tests/v1.14.1/output.txt`.

### Changed
- Merged fetched `origin/main` into the server checkout.
- Preserved the custom default admin identity and token registration during merge resolution.

### Removed
- none

## v1.14.0 — 2026-08-30 — Deploy readiness + full regression

### Added
- `Doc/guides/deploy.md` — production runbook: rsync, .env checklist (JWT_SECRET, SMTP), systemd, auto-migrations, backup crontab, post-deploy verify commands (health/tunnel/2FA/shield), rollback.
- `Doc/tests/v1.14.0/` — 9-point full-system regression (all PASS).

### Changed
- none

### Removed
- none

## v1.13.0 — 2026-08-30 — Weekly digest + team activity feed — 2026-08-30 — Weekly digest + team activity feed

### Added
- Weekly usage digest emails (app/core/digest.py): scheduler at boot (hourly tick, Monday 08:00 UTC send window, Redis 7d dedupe) — requests / GB / addresses / tokens summary via existing email infra (kind=digest).
- `GET /teams/{id}/activity` — team event feed from audit_logs (team.* + token.team_assign), viewable by any member.
- Teams page: 🕐 Recent activity section per team (Load button fetches the feed).
- `Doc/tests/v1.13.0/` evidence.

### Changed
- none

### Removed
- none

## v1.12.0 — 2026-08-30 — Tunnel supervisor + Remote Devices — 2026-08-30 — Tunnel supervisor + Remote Devices

### Added
- SDK `watch()` supervisor (`sdk/pinggy_sdk.py`): keeps a tunnel alive forever — subprocess ssh with ServerAlive + ExitOnForwardFailure, exponential backoff reconnect (1s→30s), SIGINT/SIGTERM clean stop, `on_event(up/down/retry)` callback, multi-port aware (`ports=[3000, 8000]` → `TOKEN--p1,p2`).
- `GET /manage/devices` — Remote Devices registry: tunnels grouped by connecting machine (ssh_peer) with tunnels served, requests, last seen, last token, and live online status (cross-checked against the in-memory registry).
- Dashboard **Remote Devices** page: device table (online/offline badge, stats, token copy) + supervisor quickstart snippet.
- `Doc/tests/v1.12.0/` evidence.

### Changed
- none

### Removed
- none

## v1.11.0 — 2026-08-30 — Hardening: refresh tokens, security headers, audit CSV, DB backups — 2026-08-30 — Hardening: refresh tokens, security headers, audit CSV, DB backups

### Added
- `POST /auth/refresh` — JWT refresh flow: 7-day `type=refresh` tokens (`create_refresh_token`, `JWT_REFRESH_TOKEN_EXPIRE_DAYS`); access tokens presented as refresh → 401. Access tokens remain 60 min.
- `SecurityHeadersMiddleware` — X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy on every response; HSTS behind https.
- `GET /audit/export.csv` — admin CSV dump of the audit trail (5k default, 50k max).
- `scripts/backup_db.sh` — gzipped pg_dump + 14-day retention (crontab line documented in the script).
- `Doc/tests/v1.11.0/` evidence.

### Changed
- none

### Removed
- none

## v1.10.0 — 2026-08-30 — DDoS / API-hit shield + WebSocket tunnels

### Added
- `RateLimitMiddleware` (outermost, Redis ZSET sliding window): **API 60/min/IP**, **AUTH 10/min/IP** (login/register/forgot/verify-otp/reset), **TUNNEL 240/min/IP + 600/min/subdomain**. 429 + Retry-After on breach.
- Fail2ban-style auto-ban: 3 strikes in 10 min → IP blocked 1h via existing blocklist (auth brute-force / tunnel flood / api abuse reasons logged).
- WebSocket tunnel pass-through (`tunnel_websocket` ASGI route on `/*`): HMR, socket.io, live-reload now work through tunnels; reuses token security (basic-auth / IP whitelist / bearer) and multi-port endpoints.
- `Doc/tests/v1.10.0/` evidence (exact-limit tests + auto-ban + WS echo E2E).

### Changed
- Middleware stack: RateLimit → IPMonitor → TunnelProxy → CORS (shield outermost).

### Removed
- none

## v1.9.0 — 2026-08-30 — Multi-port token (Pro): every address → its own local port

### Added
- One SSH connection, multiple projects: username `TOKEN--P1,P2,...` + one `-R0:127.0.0.1:Px` per address. Listeners bind to addresses in canonical order (subdomain → primary → extras); the proxy routes each Host to its own remote port within the SAME tunnel session.
- Pro-gated at SSH auth (non-Pro with a port-map suffix → rejected); legacy `users.tunnel_token` path rejects multi-port.
- `TunnelSession.endpoints` (address → remote_port) + `local_ports` (display) + `endpoint_port()` fallback; proxy resolves the matched address to its port.
- Configure page: "Multi-port [Pro]" checkbox → per-address port inputs → auto-generates the multi-`-R` command (SSH + Docker tabs); SSH banner prints an endpoint line per address.
- Per-connection `_setup_lock` in the SSH server — fixes a listener-setup race where concurrent `_detect_port_and_setup` tasks caused duplicate-subdomain INSERT errors (also affects single-port reconnects).
- `Doc/tests/v1.9.0/` evidence (two local projects served under one token/connection).

### Changed
- `_detect_port_and_setup` rewritten: detects ALL unbound listeners, re-scans inside the lock.

### Removed
- none

## v1.8.0 — 2026-08-30 — Unified Domains page (all addresses, one place)

### Added
- Domains page rebuilt: summary strip (tokens / fixed subdomains / primary / extra counts), single "➕ Add a domain" box (domain + token picker + type: Extra or Primary + collapsible DNS steps), and one card per token listing **every address it answers on** — Subdomain, Primary domain, Extra domains — each with 📋 copy and its action.
- Subdomain management on the Domains page: "Set fixed" / "Change" modal (3–50 chars, uniqueness enforced).
- Whole-system removal: Remove primary clears `users.custom_domain` + `tokens.custom_domain`; Remove extra deletes the `token_domains` row — toast confirms "removed from the system".
- Cross-store consistency: a domain used as someone's primary can't be added as an extra (409 with owner info); promoting a domain to primary auto-removes it from `token_domains` anywhere (one domain, one meaning).
- `via_team.owner=true` on own tokens (fixes own team-shared tokens being misfiltered — Domains page showed 0 tokens; Teams share-dropdown filter fixed likewise).

### Changed
- Domains page now builds from `GET /tokens` only (no /tunnels/info dependency).

### Removed
- Legacy "Custom Domain" card (input + Routes-to dropdown — replaced by Add-a-domain type picker), stale "Default Subdomain" card (hardcoded 098f6bc…, claimed unchangeable — false since fixed_subdomain is editable), old "Extra Domains" card with its own token selector. `renderXDomains`/`addXDomain`/`removeXDomain` functions.

## v1.7.1 — 2026-08-30 — Custom domain now reflects system-wide (fix)

### Added
- `PUT /users/me/custom-domain` accepts `token_id` — the domain is now ALSO written to `tokens.custom_domain` (what SSH banner, Host routing and tunnel URLs actually read). Defaults to the user's most recent token without a domain; clears from the user's other tokens (UNIQUE = one domain → one tunnel). Clearing removes it everywhere.
- Domains page: "Routes to token" dropdown (✓ marks current attachment) + reconnect hint.
- Audit `user.custom_domain`.

### Changed
- Saving a domain on the Domains page now reloads the Domains page (shows attachment) instead of jumping to Quickstart.

### Removed
- Debris test token `0fd4ea39…` (v1.7.0 test leftover); its extra domain `shop.mytest.dev` cascade-removed.

## v1.7.0 — 2026-08-30 — Teams role control system

### Added
- Role hierarchy with real enforcement: **owner** (from teams.owner_email) → **admin** → **member**; platform admins keep their bypass.
- `PATCH /teams/{id}/members/{email} {role}` — promote/demote (owner-only; owner row immutable; audit team.role_change).
- Token sharing: `PUT /tokens/{id}/team {team_id|null}` assigns/unassigns a token to a team (uses the 0023 `tokens.team_id` column for the first time). Owner + team admins can share/unshare; plain members 403.
- `GET /teams` now returns `my_role` + the team's shared `tokens` (id, name, subdomain, owner_email).
- `GET /tokens` now includes `team_id`, `via_team` and — for members — tokens shared by other owners as "name (shared)" (read-only view).
- Guards: PUT/DELETE `/tokens/{id}` allow token owner / team owner / team admin; plain members get 403 "Read-only…".
- Teams page: role badges + per-member role dropdowns (owner view), **🔗 Team tokens** card (shared list, Share-token select, Unassign), "(you)" marker, add-member role select.
- Manage Tokens: 👥 badge on team-shared tokens (tooltip shows team + your role).
- `Doc/tests/v1.7.0/` — full permission matrix (member 403 ×4, team_admin 200 ×2, role change owner-only).

### Changed
- `update_token`/`delete_token` ownership checks replaced by team-aware `_token_manage_role` (platform admin still bypasses).

### Removed
- none

## v1.6.0 — 2026-08-30 — API key plan caps + optional expiry

### Added
- Migration 0025: `api_keys.expires_at` (TIMESTAMPTZ NULL = never) + index.
- Plan-based key caps: **Free = 5, Pro = 10** — 6th create on Free → 402 with upgrade hint; expired keys still count, revoking frees a slot.
- Optional key expiry at creation: `expiry_days` 30 | 90 | null (never); enforced at auth (`expires_at > now()` in key lookup — expired key → 401).
- API Keys page: "N / limit used" counter next to title (plan-aware), **Expires** column (never / date / `expired` badge), at-cap warning banner with Upgrade button + disabled Create.
- Create-key modal replaces prompt(): Name + Expires dropdown (Never / 30 / 90 days).
- `ApiKeyOut.expires_at`; `Doc/tests/v1.6.0/` evidence (cap 201×5→402, expiry 200→401 after force-expire, UI +30d exact).

### Changed
- `resolve_api_key` now rejects expired keys (single auth path — covers all X-Api-Key endpoints).

### Removed
- none

## v1.5.1 — 2026-08-30 — API key how-to + dashboard api() body fix

### Added
- API Keys page: "🔌 How to connect & use your API key" card (3 steps: create key → X-Api-Key header → curl with origin-filled URL + 📋 Copy button) shown above the keys table; links to API Docs.
- Created-key modal now embeds a ready-to-run curl command containing the REAL key + copy buttons (key + curl).

### Changed
- dashboard `api()` helper now JSON-stringifies object bodies (string bodies pass through) — fixes 422 "[object Object]" errors.

### Removed
- none

## v1.5.0 — 2026-08-30 — Two-Factor Authentication (email OTP)

### Added
- Migration 0024: `users.twofa_enabled` (BOOLEAN, default false).
- 2FA login flow: password OK + 2FA on → `POST /auth/login` returns `{otp_required, challenge}` (no token); 6-digit code emailed (subject `IRAGT verification code: NNNNNN`, kind=otp), sha256(code):email stored in Redis `otp:{challenge}` TTL 5 min (in-memory fallback when Redis off).
- `POST /auth/verify-otp {challenge, code}` → JWT on match; challenge consumed on any attempt (one-time); wrong/expired → 401.
- `GET/PUT /auth/2fa` — user toggles own 2FA (audit `auth.2fa`, `auth.otp_challenge`).
- login.html: inline verification-code step (password field swaps to OTP input, button becomes Verify & Login).
- dashboard.html: 🛡️ Security header button → 2FA enable/disable modal; inline login handles OTP step.
- `Doc/tests/v1.5.0/` evidence (wrong-code 401, real code 200, replay 401, browser E2E).

### Changed
- `POST /auth/login` no longer declares `response_model=Token` (2FA branch returns a different shape; success shape unchanged).
- Login-alert email now notes two-factor verified on OTP logins.

### Removed
- none

## v1.4.0 — 2026-08-30 — Multi-domains, Teams, Support Tickets

### Added
- Migration 0023: `token_domains` (up to 3 extra domains per token), `teams` + `team_members`, `tickets` + `ticket_messages`, `tokens.team_id`.
- Multi-domain per token: `POST/DELETE /tokens/{id}/domains[/...]` (Pro-gated, unique across platform); extra domains load at SSH auth and route through the same tunnel (Host matching strips `:port`).
- Teams API (`/teams`): create/delete team, add member (must be registered user, 404 hint otherwise; 409 on duplicate), remove member (owner or self; owner protected), owner auto-admin.
- Support tickets API (`/tickets`): user create/reply/close + thread view; admin list-all with status filter + staff reply (sets status answered, notifies owner by email best-effort).
- Dashboard pages: **Teams** (create team, members table, add/remove member, delete team), **Support** (open ticket, my tickets with status badges, thread modal with reply/close), **Domains → Extra Domains** card (Pro) per-token management.
- Admin page: **🎫 Tickets** (status filters, thread modal, staff reply, close).
- `TokenOut.domains` list; audit events `team.*` and `ticket.*`.
- `Doc/tests/v1.4.0/` evidence (E2E: extra domain routed through live tunnel → 200; teams/tickets API assertions 200/404/409).

### Changed
- Custom-domain matching in tunnel registry now strips `:port` from Host header (both primary and extra domains).
- `tunnels/info` Domains page now also loads tokens list for per-token extra-domain management.

### Removed
- none

## v1.3.0 — 2026-08-30 — Branding & UX batch

### Added
- IRAGT rebrand across all UI, titles, SSH banner, emails, invoice, health.
- Platform auto-detect on Configure (manual choice pins it).
- API Docs page (endpoints reference + curl + SDK).
- Login-alert and API-key-created emails (best-effort, logged).
- Styled hover tooltips on usage charts (user + admin).

### Changed
- Billing Monthly/Yearly toggle fixed (re-render no longer resets active state).
- User-side design polish pass (hover states, focus rings, animations, scrollbar).

### Removed
- All user-visible "pinggy"/"⚡ Tunnel" branding (localStorage keys + internal
  DB names intentionally kept for session/data compatibility).

## v1.2.0 — 2026-08-30 — Active Tunnels: Sent ↑ / Received ↓ data

### Added
- Migration 0022: per-direction traffic counters (bytes_sent / bytes_received)
  with write-through from the proxy (received = request bytes in, sent =
  response bytes out).
- TunnelOut + /tunnels/my, /tunnels, /tunnels/history expose both fields.
- User Active Tunnels table: ↓ Received and ↑ Sent columns (replaces single
  Data column); admin All Tunnels likewise.
- `Doc/tests/v1.2.0/` evidence (asymmetric-payload E2E: 5000↓/11↑ verified in
  API + DB + live UI).

### Changed
- bytes_transferred now counts requests + responses (previously response-only).

### Removed
- none

## v1.1.0 — 2026-08-29 — User Dashboard Parity

### Added
- **My Usage** page: user-scoped analytics (GET /analytics/my) — 5 stat cards +
  3 daily bar charts of the user's own tunnels/requests/data.
- **Inspector** page: standalone web debugger (tunnel picker, captures,
  expandable details, replay, clear) — no longer hidden behind a button.
- **Announcements** page (user view; banner on Quickstart remains).
- Manage Tokens: visible **Type** (HTTP/TCP:port) and **Security** badge
  columns + 📌 pinned-subdomain marker; tunnel_mode/tcp_port returned by API.

### Changed
- "Subscription" renamed to **Billing & Invoices** (menu + page).

### Removed
- none

## v1.0.0 — 2026-08-29 — TCP tunnels + persistent ports (Track 5) 🎉

### Added
- Migration 0021: tokens.tunnel_mode (http|tcp) + tokens.tcp_port (UNIQUE,
  persistent, Pro-only).
- `app/core/tcp_relay.py`: public TCP listeners relaying both directions to the
  token's SSH-forwarded port; auto-closed when the tunnel disconnects.
- SSH server starts/stops relays with the tunnel lifecycle.
- PUT /tokens/{id}: tunnel_mode + tcp_port — Pro-gated (402), unique (409).
- Configure page: Tunnel type selector (HTTP / TCP Pro); edit-token modal:
  Tunnel type + Persistent TCP port fields.
- `Doc/tests/v1.0.0/` evidence (Pro gating, listener lifecycle, full TCP
  echo E2E through the public port).

### Changed
- Token lookup in _setup_tunnel now also loads tunnel_mode/tcp_port.

### Removed
- none

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
