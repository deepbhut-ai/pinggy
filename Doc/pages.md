# pages.md — thin summary (details live in page-map.md)

| URL | Name | Purpose | Auth |
|---|---|---|---|
| / | Landing | Marketing page: features, how-it-works, pricing (Free / Pro ₹199 / Enterprise) | none |
| /login | Login / Sign-up | Email+password login & registration, issues JWT | none |
| /admin | Admin panel | Users / tokens / tunnels / payments / IP-monitor management + stats | admin JWT |
| /dashboard | User dashboard | Tunnel tokens, custom domain, plan/billing, live tunnels | user JWT |
| /docs, /redoc | Swagger / ReDoc | Auto API docs | none |
| /health | Health | JSON status | none |
| http://{sub}.localhost:8020 | Tunnel URLs | Proxied user services via SSH reverse tunnels | public |
