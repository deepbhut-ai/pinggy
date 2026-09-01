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
