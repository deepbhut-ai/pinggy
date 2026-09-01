# Competitive Analysis — pinggy.io Dashboard vs IRAGT Tunnel
**Date:** 2026-08-29 · **Method:** Live page-by-page audit of https://dashboard.pinggy.io/ (logged-in Pro account) vs our v0.6.0 codebase
**Goal:** Identify what to build so we beat them on ease-of-use AND features.

---

## 1. Executive Summary

Pinggy's product maturity lives in **three areas we completely lack**:

1. **Tunnel options & protocol depth** — TCP/TLS/UDP tunnels, per-tunnel basic-auth / IP-whitelist / bearer-auth, live web debugger with request replay, header rewriting, QR codes, multi-forwarding (several domains → several local ports in ONE tunnel).
2. **Command builder UX** — platform-aware commands (macOS/Linux/Windows), SSH/CLI/Docker tabs, "Download script" button, saved named configurations, region picker, 30+ app presets (Django, Jupyter, MySQL…) that pre-fill everything.
3. **Programmability & org features** — dashboard **API keys** (manage tunnels from CI/scripts), **Teams** (shared tokens/domains), **Remote Devices**, and a proper **CLI + Node.js/Python SDKs**.

Our advantages today: full **admin panel** (analytics, audit, IP monitor, coupons, announcements, invoices, plans editor), **crypto payments**, unlimited-data free tier, self-hosted. Pinggy has **none of that** — their admin is invisible to users; this is our enterprise wedge.

**Bottom line:** parity needs ~8 feature tracks (§5). The two highest-impact quick wins are the **upgraded command builder** (a weekend of work, transforms perceived ease-of-use) and **tunnel-level auth options** (basic auth + IP whitelist + bearer token — moderate work, huge "features" win).

---

## 2. Pinggy Dashboard — Page-by-Page Audit

### 2.1 Quickstart (/quickstart)
- Step wizard: **Choose app/service** → **Paste command** → **More settings** → **Documentation**.
- **30+ app presets** with icons/descriptions: Django, Jupyter, Apache, Drupal, Express, Flask, GitLab, Hugo, Jekyll, Joomla, Laravel, MongoDB, MsSQL, MySQL, Netdata, Next.js, Nextcloud, Nginx, Nuxt, PostgreSQL, Rails, React, Redis, Spring Boot, Vite, WordPress… Selecting one auto-fills local address + recommended options.
- OS tabs (Mac/Linux/Windows), Copy + **Download** command.
- "More Settings": **Web Debugger** (default URL http://localhost:4300), **QR Code**, "More Customizations" → configure page.
- Docs tabs: SSH, **CLI, App, Node.js SDK, Python SDK, Docker**.

### 2.2 Configure Tunnel (/)
- **Tunnel type radio: HTTP / TCP / TLS / UDP.**
- Local address (accepts full URL form `http://localhost:80`).
- **Platform dropdown** (Mac (ZSH), Linux, Windows PowerShell…) — command syntax adapts.
- **Access token dropdown** (pick which token) + masked preview + show/copy + "Tunnel Active" link.
- **Region selector (Auto)** — multi-region ingress.
- Command tabs: **SSH / Pinggy CLI / Docker**; Copy + **Download**.
- **Persistent URL panel** for the chosen token (both pinggy.link + custom domain, port).
- **Save / Load configurations** — named, reusable command presets.
- **OPTIONS panel** (toggles rewrite the command live):
  - *CONNECTION:* **Auto Reconnect**, **Keep Alive**, **Force New Tunnel**.
  - *SECURITY:* **Password Protect** (basic auth user/pass), **HTTPS Only**, **IP Whitelist** (CIDR ranges), **Key/Token Auth** (require bearer token on every request).
  - *REQUEST OPTIONS:* **Web Debugger**, Host Key Check, **QR Code**, **Allow CORS Preflight**, **No Reverse Proxy**, **Connect to HTTPS Server** (local service is itself HTTPS), **X-Forwarded-For Header**, **Original Request URL Header** (X-Pinggy-Url), **Live Header Modifications** (add header rewrite rules).
- **FORWARDINGS panel:** default forwarding + **"Additional forwarding"** — route *additional domains* to *different local addresses* in the same tunnel (`Add Forwarding`).

### 2.3 Domains (/domains)
- Table: Token → Assigned Domains (+ reserved port).
- **Drag-and-drop** domains between tokens and an "Available Domains" pool.
- **Edit icon renames** persistent subdomains AND custom domains.
- Per-token ACTIVE badge, copy/show/edit actions.

### 2.4 Active Tunnels (/activetunnels)
- "10 ACTIVE SESSIONS" header; per row: tunnel URL (custom + pinggy.link), protocol tag, masked token, **Active Since** timestamp.
- Essentially our dashboard "My Tunnels" — but shows both URL forms and session age.

### 2.5 Manage Tokens (/managetokens)
- #, token (masked), **token name**, **plan**, last updated, **Regenerate**.
- **Pagination** (rows-per-page). 15 tokens on this account.

### 2.6 Remote Devices (/activedevices)
- Lists connected devices for device-tunneling (share a device, not a port) — links to docs. Empty here.

### 2.7 API Keys (/api-keys)
- **Create API key** → use pinggy's REST API to script tunnel/domain/token management (CI, IaC).
- Table: name, key, created at.

### 2.8 Teams (/teams)
- **Create New Team**; own teams + member teams. Teams share seats/tokens/domains (Pro: 1 team incl.).

### 2.9 Subscriptions (/subscriptions)
- **Bandwidth Usage** widget (consumption meter).
- Active subscriptions table: plan, seats, start, renewal, "Cancels on…", **Subscription settings** (cancel/manage).
- Upgrade panel: Monthly/Yearly toggle.
  - **Free $0**: single command, HTTP(S), **request-response debugging & replays**, TCP/TLS, 60-min timeout, random subdomains, **restricted bandwidth & connections**, live header manipulation.
  - **Pro $2.5/mo ($30/yr)**: unlimited duration, 1 persistent tunnel, 1 custom subdomain, 1 custom domain, **1 persistent TCP port**, 1 team, **wildcard domain**, **remote device mgmt**, priority support. **Add Seat** flow.

### 2.10 Chrome (all pages)
- Dark/light toggle; account switcher; **Request Feature** + **Help** buttons in nav.

---

## 3. Feature Matrix — Them vs Us (v0.6.0)

| Area | Feature | Pinggy | Us | Gap |
|---|---|---|---|---|
| **Protocols** | HTTP tunnel | ✅ | ✅ | — |
| | TCP / TLS / UDP tunnels | ✅ | ❌ | 🔴 big |
| | Region selection | ✅ (multi-region) | ❌ single | 🔴 |
| | Multi-forwarding (N domains → N local ports, 1 tunnel) | ✅ | ❌ | 🔴 |
| **Security** | Per-tunnel basic auth | ✅ | ❌ | 🟠 |
| | Per-tunnel IP whitelist | ✅ | ❌ (global IP monitor only) | 🟠 |
| | Per-tunnel bearer-token auth | ✅ | ❌ | 🟠 |
| | HTTPS-only toggle | ✅ | ❌ | 🟡 |
| **Debugging** | Web debugger (inspect/replay requests) | ✅ | ❌ | 🔴 killer feature |
| | Live header modification rules | ✅ | ❌ | 🟠 |
| | X-Forwarded-For / X-Url headers | ✅ | ❌ (we strip) | 🟡 |
| **Builder UX** | OS-aware command (mac/win/linux) | ✅ partial | ✅ (mac/windows in dashboard) | 🟡 |
| | CLI / Docker command tabs | ✅ | ❌ SSH only | 🟠 |
| | Download script button | ✅ | ❌ copy only | 🟡 quick win |
| | QR code for URL | ✅ | ❌ | 🟡 quick win |
| | App presets (Django/MySQL/…) | ✅ 30+ | ❌ | 🟠 |
| | Saved configurations | ✅ | ❌ | 🟡 |
| | Auto-reconnect / keep-alive flags | ✅ | ❌ | 🟡 |
| **Domains** | Custom domains | ✅ | ✅ | — |
| | Editable persistent subdomain | ✅ | ❌ (random per connect) | 🟠 |
| | Drag-drop domain→token assignment | ✅ | ❌ (form-based) | 🟡 |
| | Wildcard domains | ✅ Pro | ❌ | 🟡 |
| **Programmability** | Dashboard API keys (REST) | ✅ | ❌ (JWT only) | 🔴 |
| | Official CLI | ✅ | ❌ | 🟠 |
| | Node.js / Python SDKs | ✅ | ❌ | 🟡 |
| **Org** | Teams (shared resources) | ✅ | ❌ (seats only) | 🟠 |
| | Remote devices | ✅ | ❌ | 🟡 |
| **Billing** | Multiple gateways | Stripe/PayPal | ✅ Stripe/PayPal/**crypto** | 🟢 we win |
| | Coupons / promos | ❌ seen | ✅ | 🟢 we win |
| | Invoices (auto, printable) | ❌ seen | ✅ | 🟢 we win |
| | Seats | ✅ | ✅ | — |
| | Bandwidth usage meter | ✅ | ❌ (requests+bytes per token only) | 🟡 |
| **Admin/Enterprise** | Admin panel w/ analytics | ❌ | ✅ | 🟢 we win |
| | Audit log | ❌ | ✅ | 🟢 we win |
| | IP monitoring + auto-block | ❌ | ✅ | 🟢 we win |
| | Announcements/campaigns, email system | ❌ | ✅ | 🟢 we win |
| | Editable plans/pricing | ❌ (static) | ✅ | 🟢 we win |
| **Free tier** | Data | restricted bandwidth/connections | **unlimited transfer** | 🟢 we win (market it!) |
| **Price** | Pro | $2.5/mo, $30/yr | ₹199 (~$2.38)/mo — yearly 10× monthly | 🟢 roughly equal; ours slightly cheaper |

---

## 4. Ease-of-Use Comparison (UX)

**Where pinggy feels easier today:**
1. The **command builder is the whole product** — every toggle instantly rewrites the command; a beginner never edits flags by hand.
2. **App presets** remove the "what's my port?" question entirely.
3. **Download button** — no copy-paste on Windows terminals that mangle long lines.
4. **Persistent URLs per token** — your URL survives restarts (ours regenerates a random subdomain every connect unless custom domain is set).
5. **QR code** — instant mobile testing of a local dev server.

**Where we're easier:**
1. Full **admin panel** — no pinggy equivalent (their "enterprise" story is invisible).
2. **Insights/analytics**, coupons at checkout, invoice self-service.
3. Crypto payments for markets Stripe/PayPal don't serve.

---

## 5. Recommended Roadmap (priority order)

### Track 1 — Command Builder 2.0 🟢 *quick win, ~2–3 days* (ease-of-use parity)
- App presets catalog (start with 15: Django, Flask, Jupyter, Node/Express, React/Vite dev, Next.js, Laravel, WordPress, Nginx, Apache, MySQL, PostgreSQL, MongoDB, Redis, Django).
- **Download .sh / .bat / .command** button next to Copy.
- **QR code** for the live tunnel URL (pure-JS renderer, no deps).
- Save/Load named configurations (localStorage + DB table `tunnel_configs`).
- Add `-o ServerAliveInterval=30` style toggles: Auto-Reconnect (autossh wrapper in downloaded script), Keep-Alive.
- Docker tab: emit `docker run pinggy-style` equivalent for our image.

### Track 2 — Tunnel-level Security Options 🟠 *~1 week* (feature parity, sells Pro)
- SSH username syntax extension: `token:pass=user:pass@a.tunnel` style flags (like pinggy's `oXO2Tyeew7v:pass=user:pw@`).
- **Basic auth** on tunnel (proxy middleware checks `Authorization` per subdomain) — migration: `tunnels.basic_auth_user/pass` or per-token settings JSON.
- **IP whitelist** per token (CIDR list, checked in proxy).
- **Bearer-token auth** per token (require `X-Api-Key` on every request).
- HTTPS-only toggle.
- These are proxy-middleware features — our `TunnelProxyMiddleware` is the single interception point, so all four land in one place.

### Track 3 — Persistent Subdomains + Domain Manager 2.0 🟠 *~4–5 days*
- Make the **subdomain stable per token** (edit it, keep it across restarts) — DB change + ssh_server allocation honoring existing token→subdomain mapping.
- Domains page: drag-drop assignment, edit-in-place (matches pinggy UX exactly).

### Track 4 — Dashboard REST API + API Keys 🟠 *~4 days* (unlocks integrations)
- `api_keys` table (hashed keys, scopes: tunnels/domains/tokens read-write).
- REST endpoints mirroring dashboard: list/create/stop tunnels, assign domains, CRUD tokens — key-auth'd.
- Publish minimal **Python SDK** (single-file `pip install` wrapper) — beats pinggy on time-to-first-call if their SDK needs signup friction.

### Track 5 — TCP/TLS Tunnels + Persistent Ports 🔴 *~2 weeks* (biggest engineering lift)
- Raw TCP forwarding in the proxy (non-HTTP listener per persistent port).
- Tunnel type in builder (HTTP default; TCP/TLS for Pro).
- Persistent TCP port per token (port stays yours).
- UDP likely skip (niche, big NAT complexity).

### Track 6 — Web Debugger with Replay 🔴 *~2 weeks* (the demo-winning feature)
- Capture request/response pairs per tunnel (ring buffer in Redis, 100 reqs).
- Viewer page: HAR-like inspector; **Replay** button re-fires the request.
- This is pinggy's most-loved feature; even a v1 (inspect-only) is a differentiator for our admin panel too ("per-tenant traffic inspector").

### Track 7 — Teams 🟡 *~1 week*
- `teams` + `team_members` tables; tokens/domains owned by team; seat billing already exists.

### Track 8 — Polish parity 🟡 *~2 days*
- Active-since timestamps + both-URL display on tunnels list (small).
- Bandwidth usage widget on subscription page (aggregate per user; we already track bytes).
- Pagination on tokens page.
- Dark/light toggle on user dashboard (admin already dark).
- "Request Feature" button → posts to announcements/feedback table.

### Marketing (zero code, do immediately)
- Advertise **unlimited data on Free** (pinggy restricts bandwidth/connections).
- Advertise **crypto payments**, **team invoicing**, **self-hosted/white-label** — none exist on pinggy.
- Keep Pro at ₹199 ≈ $2.38 vs their $2.50 — "same price, more features".

---

## 6. Suggested Version Plan
| Version | Track | Theme |
|---|---|---|
| v0.7.0 | Track 1 | Command Builder 2.0 (presets, download, QR, saved configs) |
| v0.8.0 | Track 2 + 8 | Tunnel security options + polish |
| v0.9.0 | Track 3 | Persistent subdomains + domain drag-drop |
| v0.10.0 | Track 4 | API keys + REST + SDK |
| v0.11.0 | Track 6 | Web debugger v1 (inspect) |
| v1.0.0 | Track 5 | TCP/TLS tunnels — "1.0 feature-complete" launch |

---

## 7. Appendix — Evidence
Captured live from the logged-in pinggy dashboard (contact@iraglobaltech.com account) on 2026-08-29: Configure page full options list, Quickstart app catalog, Domains drag-drop table, Active Tunnels (10 sessions), Manage Tokens (15 tokens), Remote Devices, API Keys, Teams, Subscriptions (9 active subs, pricing $2.5/mo Pro). Session screenshots available in VS Code browser tabs; raw text extracts in this repo's session log.
