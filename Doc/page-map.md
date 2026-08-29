# page-map.md — MASTER page & connection map (pages.md/impact-map.md derive from this)

Local base: http://127.0.0.1:8020 · Prod: https://iraglobaltech.com (nginx → 127.0.0.1:8000)

## Page table
| URL | Page name | DB tables (R/W) | Functions/endpoints | Components (static) | Auth | Links to | Linked from | Shares data with |
|---|---|---|---|---|---|---|---|---|
| / | Landing | — | GET / | landing.html | none | /login | /login ("← Back to home"), /dashboard nav after login | none |
| /login | Login / Sign-up | users W (via /auth/register) | POST /auth/register, POST /auth/login | login.html | none | /admin (role=admin), /dashboard (role=user) | / ("Get Started"), landing pricing buttons | users (auth) |
| /admin | Admin panel | users R, tunnels R, tokens R, payments R | GET/PUT/DELETE /users, /tokens/admin/*, /payments/admin/*, /ip-monitor/*, GET /tunnels/stats, GET /tunnels/history (All Tunnels view), DELETE /tunnels/{sub} | admin.html | JWT, role=admin | /dashboard (via user link), /docs, /redoc, /health | /login (on admin login) | users/tunnels/tokens/payments + Redis IP stats — ALL admin views |
| /dashboard | User dashboard | users R/W (custom-domain, plan), tokens R/W, tunnels R | GET /auth/me, /auth/tunnel-token, POST /auth/regenerate-token, /tokens CRUD, PUT /users/me/custom-domain, POST /payments/checkout, GET /tunnels/my, POST /tunnels/{sub}/stop | dashboard.html | JWT | / (logout), /login (expired) | / (nav when logged in), /admin | users, tokens, tunnels, payments |
| /docs, /redoc | API docs (auto) | — | openapi | FastAPI built-in | none | — | /admin System Info table | none |
| /health | Health check | — | GET /health | JSON | none | — | /admin System Info | none |
| http://{sub}.localhost:8020 | Tunnels (dynamic) | tunnels W (request_count, bytes), users R (token auth at SSH time) | TunnelProxyMiddleware → 127.0.0.1:{remote_port} | — (proxied user content) | none (public URL) | — | — | tunnels table + in-memory registry (with /admin, /dashboard views) |

## Navigation graph
```
/            → /login
/login       → /admin (admin) | /dashboard (user)
/admin       → /dashboard, /docs, /redoc, /health
/dashboard   → /, /login
```

## Data-flow graph (change on A reflects on B)
```
/login (register)      ––[users INSERT]––> /admin (user list, stats), /dashboard
/dashboard (tokens)    ––[tokens table]–-> SSH auth (tunnel connect), /admin (All Tokens)
SSH connect            ––[tunnels table + registry]–-> /admin (All Tunnels, activity), /dashboard
{sub}.localhost tunnel ––[request_count/bytes + Redis]–> /admin (stats, IP Monitor), /dashboard
payments webhook       ––[users.plan]–> /dashboard (plan badge, checkout CTA)
admin user CRUD        ––[users]–> /login (credentials), /dashboard
```

## Shared state
- JWT in localStorage (admin.html, dashboard.html) — key name per page code.
- Redis db0: ip counters/blocklist — written by middleware on every direct request,
  read by /admin IP Monitor tab.
- In-memory tunnel registry — written by SSH server, read by proxy; gone on restart
  (tunnels table rows remain but are stale until marked closed on graceful shutdown).

## Orphan check
- All pages reachable (/ ← start, /login ← /, /admin & /dashboard ← /login).
- /docs /redoc /health are utility endpoints (linked from /admin).
