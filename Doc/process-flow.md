# Process Flow — Pinggy Tunnel Dashboard

## Architecture Overview

Pinggy is a secure tunneling service that allows users to expose local applications to the internet via SSH tunnels and HTTP proxies. The application follows a layered architecture:

```
┌──────────────────────────────────────────┐
│  Frontend (HTML/CSS/JS Templates)         │
│  - Landing, Login, Dashboard, Admin Panel │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│  FastAPI REST API (app/api/routers/)      │
│  - Auth, Users, Tunnels, Tokens, Payments│
│  - IP Monitor, Admin Endpoints            │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│  Core Services (app/core/)                │
│  - SSH Server, Proxy, Tunnel Registry     │
│  - Security, Database, Redis, Config      │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│  PostgreSQL Database                      │
│  - Users, Tunnels, Tokens, Payments       │
└──────────────────────────────────────────┘
```

## Request Lifecycle

1. **User Login**: Browser sends credentials → Auth endpoint validates → JWT token returned
2. **Tunnel Creation**: User creates tunnel → API validates subdomain → SSH key generated → Tunnel registered
3. **SSH Connection**: External client connects via SSH → SSH server routes to tunnel → Proxy forwards to localhost
4. **Dashboard Update**: Periodically polls `/api/tunnels` → Updates active tunnel list with stats

## HTTPS / SSL Layer (v2.6.0)

nginx terminates TLS on port 443 and proxies to FastAPI on 127.0.0.1:8000:

```
Browser (HTTPS)
  → nginx :443 (SSL termination, SNI-based cert selection)
    → FastAPI :8000 (TunnelProxyMiddleware)
      → SSH tunnel remote_port (127.0.0.1:<remote_port>)
        → User's local app
```

**Cert hierarchy (SNI-based):**
- `iraglobaltech.com` → LE cert (existing, valid until 2026-11-22)
- `webifly.callingagents.in` → LE cert (v2.6.0, valid until 2026-12-13)
- `*.callingagents.in` (default) → self-signed wildcard fallback (replaced per-sub by LE certs via `provision_fleet_ssl.sh`)
- Per-subdomain LE certs are added as `custom-<sub>.callingagents.in` nginx configs by the ssl_manager or `provision_fleet_ssl.sh`

**Port 80 (existing, unchanged):** ACME challenge webroot (`/.well-known/acme-challenge/`) + HTTP→HTTPS 301 redirect.

**Config files:**
- `/etc/nginx/sites-enabled/iragt.react.conf` — port 80 (HTTP redirect, ACME, React SPA for iraglobaltech.com)
- `/etc/nginx/sites-enabled/iragt.ssl.conf` — port 443 (SSL for iraglobaltech.com + fleet subs + default fallback)
- `/opt/iragt/nginx/iragt.ssl.conf` — project-tracked copy

**Fleet SSL provisioning:** `scripts/provision_fleet_ssl.sh` checks DNS → certbot HTTP-01 → per-sub nginx config → reload. Prerequisite: `scripts/create_cf_dns_records.sh <CF_TOKEN>` creates A records first.

## Key Entry Points

| Route | Handler | Purpose |
|-------|---------|---------|
| `GET /` | [Landing page](app/static/landing.html) | Public landing page |
| `GET /login` | [Login page](app/static/login.html) | User login form |
| `POST /api/auth/login` | [auth.py](app/api/routers/auth.py#L30) | Authenticate user, return JWT |
| `GET /dashboard` | [Dashboard page](app/static/dashboard.html) | User tunnel dashboard |
| `POST /api/tunnels` | [tunnels.py](app/api/routers/tunnels.py) | Create new tunnel |
| `GET /api/tunnels` | [tunnels.py](app/api/routers/tunnels.py) | List user's tunnels |
| `GET /admin` | [admin.py](app/api/routers/admin.py) | Admin panel (auth required) |

## Database

See [database.md](database.md) for schema and migrations.

## Functions & Endpoints

See [functions.md](functions.md) for all API functions and their signatures.

## Pages & Navigation

See [page-map.md](page-map.md) for complete page routing and data connections.
