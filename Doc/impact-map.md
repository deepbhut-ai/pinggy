# impact-map.md — ripple edges (derived from page-map.md "Shares data with")

## Dependency table
| Page | Depends on | Affects (ripple) | Triggered by |
|---|---|---|---|
| /admin | users, tunnels, tokens, payments tables; /users,/tokens,/payments,/ip-monitor,/tunnels APIs; Redis | — (read-mostly hub) | any data change below |
| /dashboard | users (self), tokens, token_domains, teams/team_members, tickets, tunnels, payments; /auth,/tokens,/teams,/tickets,/users/me/*,/payments APIs | /admin (tickets shared: user create → admin Tickets; staff reply → user Support) | own token/domain/plan/team/ticket edits |
| /login | users.email/password_hash (auth API) | /admin, /dashboard (identity everywhere) | registration, admin user edits |
| / (landing) | none (static) | none | — |
| {sub}.localhost tunnels | in-memory registry + tunnels.remote_port; users/tokens at SSH-connect time | /admin stats, /dashboard tunnel list | SSH connect/disconnect, proxy traffic |

## Directed edges (action on A → B reflects)
```
/login register           --> /admin user list +stats, /dashboard, audit_logs
/admin user edit/disable  --> /login (creds/status), /dashboard, SSH auth (is_active), audit_logs
/admin ip config change   --> middleware auto-block behavior (runtime), audit_logs
/admin token CRUD         --> SSH connect auth, /admin All Tokens
/admin user update/delete --> /login (creds), /dashboard, SSH legacy-token auth
SSH connect/disconnect    --> /admin All Tunnels + activity, /dashboard
payments webhook paid     --> /dashboard plan badge, /admin payments/stats
proxy traffic             --> /admin stats + IP monitor (Redis), /dashboard
```

## Shared state notes
- users.email is an FK target (tokens.user_email) — renaming requires re-linking tokens
  rows (see database.md ⚠).
- users.tunnel_token (legacy) still authorizes SSH for the seeded admin (tokens table empty locally).
