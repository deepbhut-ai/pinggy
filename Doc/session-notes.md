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

## 2026-08-29 — v0.1.1 (approved: suggestion 1 only)
- **Done:** v0.1.1 committed + tagged — admin's tunnel token backfilled into local
  tokens table (name "Default"); verified via /tokens/admin/all (1 row), tunnel E2E
  re-run PASS (auth now via tokens-table path), and dashboard "All Tokens" view.
- **In progress:** nothing. App still running (dev env, port 8020).
- **Next:** await user. Still-parked suggestions: (2) settings-driven domains in
  admin.html System Info; (3) main.py middleware comment fix; (new) auto_setup.py
  could insert the seeded token into tokens for fresh installs.
- **Watch out:** fresh installs still start with an empty tokens table (seed runs
  after migrations) — documented in Doc/database.md.

## 2026-08-29 — v0.1.3 (Job 0: 3 parked suggestions) + Jobs 1–9 backlog intake
- **Done:** v0.1.3 committed + tagged — (a) admin.html System Info settings-driven,
  (b) main.py middleware comment corrected, (c) auto_setup seeds tokens row (verified
  on scratch DB, then dropped). App restarted on 8020 (terminal 114c09eb-…).
- **In progress:** Jobs 1–9 diagnosed → Problem List + phased pipeline presented to
  user; AWAITING CONFIRMATION before any implementation.
- **Next:** on user confirmation start Phase A (likely Job 2 + Job 4 first).
- **Watch out:** `kill %1` in the wrong terminal's job list silently no-ops — kill
  servers by lsof PID. Ports 8020/2222 currently used by dev server.

## 2026-08-29 — v0.2.0 (Phase A of Jobs 1–9 plan, user-confirmed incl. suggestions)
- **Done:** v0.2.0 — Job 2 (edit user/password reset/disable-enable + is_active
  enforcement on login/API/SSH), Job 5 (IP auto-block ON/OFF + runtime thresholds),
  audit log (page + instrumentation), middleware swap (tunnel traffic IP-counted).
  Migration 0010 applied. All assertions + browser UI verified (Doc/tests/v0.2.0/).
- **In progress:** nothing — Phase A complete. Dev server on 8020 (a4b19527-…).
- **Next:** Phase B (v0.3.0): Job 4 per-token traffic columns + Job 7 daily/monthly
  dashboard analytics. Awaiting user go-ahead.
- **Watch out:** zsh UID is read-only (crashed assertion script); asyncssh bare
  connect() succeeds even for rejected tokens — test forwards, not connects.
  vtest@iraglobaltech.com / NewPass@77 kept as demo user.

## 2026-08-29 — v0.3.0 (Phase B)
- **Done:** Job 4 (per-token traffic: migration 0011 + aggregation + All Tokens/dashboard
  columns) + Job 7 (analytics endpoint + Insights charts). Fixed pre-existing bug:
  tunnel counters were never persisted (in-memory only). All assertions PASS
  (Doc/tests/v0.3.0/). Committed + tagged v0.3.0.
- **In progress:** Phase C (v0.4.0): app_settings + payment keys UI + coupons.
- **Next:** Phase D (emails, v0.5.0), then Phase E (plans + invoices, v0.6.0) — user
  pre-approved completing ALL phases without further confirmation.
- **Watch out:** analytics `days` param must be ≥7 (422 otherwise — intentional);
  hidden browser tab can make locator.click time out — reopen the page instead.

## 2026-08-29 — v0.4.0 (Phase C)
- **Done:** Job 3 (Settings page: payment keys masked, DB>env, no restart) + coupons
  (CRUD + checkout discounts + redemption). Migration 0012. All assertions PASS —
  fake-key checkout reaches Stripe (proves key flow). Committed + tagged v0.4.0.
- **In progress:** Phase D (v0.5.0): email system (SMTP settings, forgot/reset,
  welcome/tunnel-stopped hooks, campaigns) + announcements.
- **Next:** Phase E (plans + invoices, v0.6.0).
- **Watch out:** payments.coupon_code column lands in Phase E migration — the
  code is defensive about it. Test stripe key stored in local app_settings (fake).

## 2026-08-29 — v0.5.0 (Phase D)
- **Done:** Job 6 email system (SMTP runtime settings, welcome/reset/tunnel-stopped
  templates, campaigns), announcements (admin CRUD + dashboard banner), forgot/reset
  password flow (single-use hashed tokens). **CRITICAL pre-existing bug fixed: duplicate
  `let tunnelRateTracker` made the user dashboard 100% broken (never loaded).**
  Migrations 0013/0014. All assertions + browser checks PASS (Doc/tests/v0.5.0/).
- **In progress:** Phase E (v0.6.0): plans table + admin Plans editor + dynamic
  landing pricing + invoices.
- **Next:** final wrap-up after Phase E.
- **Watch out:** SMTP off locally (expected) — all email flows log to email_logs with
  status=failed until smtp_* settings are filled. vtest pw back to NewPass@77.

## 2026-08-29 — v0.6.0 (Phase E) — ALL PHASES COMPLETE
- **Done:** Job 1 (plans table + admin 💎 Plans editor + DB-driven landing pricing)
  + Job 8 (invoices auto-created on paid; admin 🧾 Invoices w/ void + printable page;
  user 🧾 My Invoices). Migrations 0015/0016. All assertions PASS (Doc/tests/v0.6.0/).
  ALL 9 JOBS + approved suggestions delivered across v0.2.0–v0.6.0.
- **In progress:** nothing. Dev server on 8020 (f9dbe947-…).
- **Next:** await user. Production deployment notes: copy .env.production → .env on
  server, git pull, restart systemd (auto_setup runs migrations 0010–0016).
- **Watch out:** invoice print uses ?token= JWT (new-tab auth); vtest is now pro
  (webhook test) — set back to free if needed: PUT /users/{id}?plan=free.

## 2026-08-29 — v0.6.1 (competitive research)
- **Done:** Audited dashboard.pinggy.io page-by-page (user's logged-in Pro account,
  9 pages) and wrote Doc/reports/pinggy-competitive-analysis.md with feature matrix
  + 8-track roadmap (v0.7.0 Command Builder 2.0 → v1.0.0 TCP/TLS). Docs-only commit.
- **Next (proposed, NOT started):** v0.7.0 Track 1 — app presets, download script,
  QR code, saved configs. Then Track 2 tunnel auth options.
- **Watch out:** pinggy Pro is $2.5/mo — our ₹199 ≈ $2.38 is fine; free-tier
  unlimited data is a marketing angle they can't match (they throttle).

## 2026-08-29 — v0.7.0 → v1.0.0 (full roadmap executed, user pre-approved)
- **Done:** ALL competitive-roadmap tracks shipped & tagged:
  v0.7.0 Command Builder 2.0 (presets/downloads/QR/saved configs/Docker tab) ·
  v0.8.0 tunnel security (basic-auth/IP-whitelist/API-key/HTTPS-only) + bandwidth
  widget · v0.9.0 persistent subdomains (+md5 backfill = stable URLs for all) ·
  v0.10.0 API keys + /manage REST + Python SDK (sdk/pinggy_sdk.py) ·
  v0.11.0 Web Debugger (capture+replay) · v1.0.0 TCP tunnels + persistent ports
  (Pro-gated, full echo E2E verified).
- **Bugs found & fixed during verification:** TunnelSession lacked token field
  (v0.8.0 security silently no-oped); duplicated const totalBytes (dashboard
  SyntaxError); get_api_user fallback 500; ssh_server multi-edit reported success
  but left old SELECT (TCP relay never started) — all caught by assertions.
- **In progress:** nothing. Server on 8020. 16 tags total (v0.1.0→v1.0.0).
- **Next:** await user — deploy to prod when ready (git pull + .env.production +
  systemd restart; migrations 0010-0021 auto-apply). Deferred: drag-drop domain
  UI, Teams, UDP tunnels, region selection, header-rewrite rules.
- **Watch out:** TCP ports 10000-19999 now used for relays; check port conflicts
  before deploy. vtest is Pro with token tools (sdktest/sdk-made may linger).

## 2026-08-29 — v0.1.2 (docs drift fix, self-initiated per §11)
- **Done:** v0.1.2 committed + tagged — tunnels router docs corrected from 3 to the
  real 7 routes (process-flow, functions, page-map). Drift exposed by a live-log 200
  on /tunnels/history; cause was a too-strict grep pattern. Live curl assertions PASS
  (Doc/tests/v0.1.2/). Zero code changes.
- **In progress:** nothing. App running (dev env, 8020); server log clean — earlier
  "Proxy error for kw8ll8g" was the pre-fix deadlocked E2E run, explained.
- **Next:** await user. Parked: (2) admin.html domains, (3) main.py comment fix,
  (4) auto_setup seeding token into tokens for fresh installs.
- **Watch out:** grep decorators with `@router\.(get|post|put|delete|patch)\(` only —
  NEVER require close-paren right after the path string.



