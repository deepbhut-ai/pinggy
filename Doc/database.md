# database.md — local PostgreSQL `pinggy`

Connection (local dev): `postgresql://postgres:root@localhost:5432/pinggy`
(brew postgresql@14; credentials in `.env`). Schema managed by Alembic — see migrations.md.

## users
| column | type | notes |
|---|---|---|
| id | UUID PK | default gen_random_uuid() (pgcrypto) |
| email | VARCHAR(255) UNIQUE NOT NULL | also the login identifier; referenced by tokens.user_email |
| password_hash | TEXT | bcrypt |
| full_name | VARCHAR(120) | |
| role | VARCHAR(20) NOT NULL DEFAULT 'user' | 'user' \| 'admin' (0002) |
| tunnel_token | VARCHAR(64) UNIQUE | legacy single tunnel token (0004) |
| custom_domain | VARCHAR(255) UNIQUE | legacy custom domain (0005) |
| plan | VARCHAR(20) NOT NULL DEFAULT 'free' | 'free' \| 'pro' (0007) |
| plan_expires_at | TIMESTAMPTZ | pro expiry (0008) |
| seats | INT NOT NULL DEFAULT 1 | (0009) |
| created_at / updated_at | TIMESTAMPTZ | defaults now() |

Index: idx_users_email. Current rows (local): 1 — support@callingagents.in (role admin,
was seeded as 'admin'/'admin' by auto_setup, re-identified in v0.1.0).

Read/write: auth (register/login), users CRUD, tokens (via email FK), ssh_server
(token verify fallback), payments (plan upgrade), admin dashboard stats.

## tunnels
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| tunnel_id | VARCHAR(20) UNIQUE NOT NULL | short id for the session |
| subdomain | VARCHAR(50) UNIQUE NOT NULL | random 7 chars per connect |
| remote_port / local_port | INTEGER | server-side / client-side (-R0:localhost:PORT) |
| protocol | VARCHAR(10) DEFAULT 'http' | |
| user_email | VARCHAR(255) | owner (no FK) |
| ssh_peer | VARCHAR(100) | client address |
| status | VARCHAR(20) DEFAULT 'active' | |
| request_count / bytes_transferred | INTEGER / BIGINT | updated by proxy |
| created_at / closed_at | TIMESTAMPTZ | |

Indexes: idx_tunnels_subdomain, idx_tunnels_status. Written by ssh_server on connect
(deletes previous row for same subdomain first) and on close; read by admin dashboard,
/tunnels/info, /users/{id}/tunnels.

## tokens  (multi-tunnel tokens — what the dashboard manages)
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_email | VARCHAR(255) NOT NULL → users(email) ON DELETE CASCADE | FK! renaming a user email requires re-linking token rows |
| token | VARCHAR(64) UNIQUE | 16-hex chars, SSH username |
| name | VARCHAR(120) | label |
| custom_domain | VARCHAR(255) UNIQUE | per-token custom domain |
| created_at / updated_at | TIMESTAMPTZ | |

Indexes: idx_tokens_user_email, idx_tokens_token.
Current rows (local): 1 — "Default" token for support@callingagents.in (backfilled
from users.tunnel_token in v0.1.1; SSH auth resolves via this table first).
⚠ Fresh-install quirk remains: migration 0006 backfills from users.tunnel_token, but
auto_setup seeds the admin AFTER migrations run, so a brand-new install starts with an
empty tokens table (SSH auth falls back to users.tunnel_token until backfilled).

## payments
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_email | VARCHAR(255) NOT NULL | |
| method | VARCHAR(20) | stripe \| paypal \| nowpayments |
| plan | VARCHAR(20) | 'pro' |
| amount / currency | NUMERIC(10,2) / VARCHAR(10) | default INR |
| status | VARCHAR(20) DEFAULT 'pending' | pending \| paid \| failed \| expired |
| provider_ref | VARCHAR(255) | intent/order/invoice id |
| provider_payload | TEXT | raw webhook JSON |
| created_at / updated_at | TIMESTAMPTZ | |

Indexes: idx_payments_user, idx_payments_ref.

## Non-DB state
- Redis (db 0): per-IP request counters + blocklist for IP monitoring (TTL = window /
  block duration). Flush-safe — purely ephemeral.
- In-memory tunnel registry (app/core/tunnel_registry.py): subdomain → TunnelSession
  (port mapping, live stats, SSH conn reference). Lost on restart; tunnels table is the
  persistent record.
