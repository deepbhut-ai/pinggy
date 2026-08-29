# process-flow.md — pinggy (IRAGT tunnel service) architecture

Single FastAPI service that combines: web UI (static HTML), REST API, an SSH server
(asyncssh) that accepts reverse tunnels, and an HTTP proxy that routes subdomain
requests through those tunnels. PostgreSQL + Redis back it.

## Startup lifecycle

```
run.py
 ├─ run_auto_setup()                    (app/core/auto_setup.py — SYNC, before event loop)
 │   ├─ _ensure_database()              CREATE DATABASE pinggy IF missing (via 'postgres' maint DB)
 │   ├─ _ensure_extensions()            CREATE EXTENSION pgcrypto (gen_random_uuid)
 │   ├─ _run_migrations()               alembic upgrade head (0001…0009)
 │   └─ _ensure_default_admin()         if users empty → seed admin (email 'admin', pw 'admin',
 │                                       role 'admin', random tunnel_token) + insert same token
 │                                       into tokens table (v0.1.3; idempotent)
 └─ uvicorn.run("app.main:app", APP_HOST:APP_PORT)
     └─ lifespan (app/main.py)
         ├─ init_pool()                 psycopg3 async pool (settings.async_dsn)
         ├─ init_redis()                redis://localhost:6379/0 (IP monitoring + cache)
         ├─ init_registry(TUNNEL_DOMAIN, PROXY_PORT)   in-memory tunnel registry
         ├─ start_ssh_server()          asyncssh on 0.0.0.0:2222, host key ssh_host_key (auto-gen)
         └─ on shutdown: close ssh → redis → pool
```

Local dev (macOS): `.venv/bin/python run.py` → http://127.0.0.1:8020 (see guides/setup.md).
Production: systemd `pinggy.service` → `/opt/pinggy/.venv/bin/python /opt/pinggy/run.py`,
nginx fronts 80/443 → 127.0.0.1:8000.

## Middleware stack (request order)

`app.add_middleware` order in main.py (v0.2.0): CORS → TunnelProxy → IPMonitor.
Starlette wraps LAST-added as OUTERMOST, so an incoming request flows:

```
request → IPMonitorMiddleware → TunnelProxyMiddleware → CORS → routes
```

Since v0.2.0 (admin-approved swap) IPMonitor is outermost: proxied tunnel traffic
IS counted by the IP monitor (previously TunnelProxy was outermost and tunnel
requests were never counted).

- `TunnelProxyMiddleware` (app/core/proxy.py): extracts subdomain from Host header →
  registry lookup → httpx forward to `127.0.0.1:{tunnel.remote_port}` → streams response,
  increments request_count / bytes. No tunnel → 502.
- `IPMonitorMiddleware` (app/core/ip_monitor.py): per-IP sliding window in Redis
  (IP_RATE_WINDOW s), auto-block over IP_RATE_BLOCK_THRESHOLD for IP_BLOCK_DURATION s.
- CORS: allow all (dev).

## SSH tunnel flow (the core feature)

```
client: ssh -p 2222 -R0:localhost:LOCALPORT <TUNNEL_TOKEN>@<host>
  └─ asyncssh server (app/core/ssh_server.py)
      ├─ begin_auth: username must be a valid token
      │    1) SELECT … FROM tokens WHERE token=%s   (multi-token, dashboard-managed)
      │    2) fallback: SELECT … FROM users WHERE tunnel_token=%s  (legacy, seeded admin)
      ├─ server_requested (tcpip-forward, port 0 = random in TUNNEL_PORT_MIN..MAX)
      ├─ _setup_tunnel: random 7-char subdomain (regenerate on collision),
      │    register TunnelSession in in-memory registry,
      │    persist row in tunnels table (DELETE old row for that subdomain first),
      │    print URL banner to the SSH terminal: http(s)://<sub>.<TUNNEL_DOMAIN>
      └─ on disconnect: remove from registry, mark tunnels row closed
```

URL scheme: `https` when PROXY_PORT==80 else `http` (TunnelSession.url, ssh_server banner).

## Proxy flow

```
browser → http://abc123.localhost:8020  (Host: abc123.localhost:8020)
  └─ _extract_subdomain (app/core/proxy.py)
      strip port → not base domain/IP → match ".{TUNNEL_DOMAIN}" or ".localhost" suffix
      else treat whole host as custom domain
  └─ get_tunnel(subdomain) → get_tunnel_by_custom_domain(host)
  └─ httpx forward 127.0.0.1:{remote_port}{path}?{query}   (hop-by-hop headers stripped)
  └─ increment_request_count + log_to_tunnel (live request log on user's SSH terminal)
```

## API surface (all under /api/v1 except admin pages)

| Router (file) | Prefix | Endpoints |
|---|---|---|
| auth.py | /auth | POST /register, POST /login, GET /me, GET /tunnel-token, POST /regenerate-token |
| users.py | /users | GET "", GET /{user_id}, PUT /{user_id}, DELETE /{user_id}, PUT /me/custom-domain, GET /{user_id}/tunnels |
| tunnels.py | /tunnels | GET /info, GET /my (own, auth), GET "" (admin, active), GET /history (admin, ?limit=50 from DB), DELETE /{subdomain} (admin force-stop), POST /{subdomain}/stop (own), GET /stats (admin) |
| tokens.py | /tokens | GET "", POST "", PUT /{token_id}, DELETE /{token_id}, POST /{token_id}/regenerate, GET /admin/all, DELETE /admin/{token_id}, POST /admin/{token_id}/regenerate |
| payments.py | /payments | POST /checkout, POST /webhook/stripe, POST /webhook/paypal, GET /paypal/capture/{order_id}, POST /webhook/nowpayments, GET /my, GET /admin/all, GET /admin/stats |
| ip_monitor.py | /ip-monitor | GET /stats, GET /ips, GET /ips/{ip}, POST /block, POST /unblock, GET /blocked, POST /geo/{ip}, GET /config (effective view), PUT /config (runtime overrides → Redis) |
| audit.py | /audit | GET "" (admin, newest first, ?limit&offset) |
| analytics.py | /analytics | GET /overview?days=7..180 (daily series, 12-month monthly series, summary — admin) |
| settings.py | /settings | GET "" (masked view), PUT "" (update, audited), GET/POST /coupons, PUT/DELETE /coupons/{id}, GET /coupons/public |
| announcements.py | /announcements | GET "" (users: active only; admin: all), POST "" , PUT/DELETE /{id} (admin), POST /campaign (SMTP-gated), GET /logs, GET /smtp-status |
| admin.py (pages, no prefix) | / | GET /, /login, /admin, /dashboard (static HTML) + /docs /redoc /health |

Auth: JWT Bearer (JWT_SECRET, HS256, claims sub=user_id, email, role).
`get_current_user` / `get_admin_user` in app/core/deps.py.

## Payments flow

POST /payments/checkout (auth) → creates provider checkout (Stripe session / PayPal order /
NowPayments invoice; enabled per *_ENABLED) → payments row (status pending, provider_ref).
Provider webhook (public) verifies signature → payments row paid → users.plan='pro',
users.plan_expires_at=+30d. Prices: PRO_PRICE_INR 199 / PRO_PRICE_USD 2.99.
Locally all providers are DISABLED (.env).

## Static pages ↔ API

landing/login/admin/dashboard HTML (app/static/*.html) call /api/v1/* via fetch;
admin.html & dashboard.html store the JWT in localStorage after /auth/login.
