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
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | (0010) — FALSE = login/API/SSH rejected |
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
| token | VARCHAR(64) | (0011) SSH token that created the tunnel — basis for per-token traffic |
| user_email | VARCHAR(255) | owner (no FK) |
| ssh_peer | VARCHAR(100) | client address |
| status | VARCHAR(20) DEFAULT 'active' | |
| request_count / bytes_transferred | INTEGER / BIGINT | updated by proxy |
| created_at / closed_at | TIMESTAMPTZ | |

Indexes: idx_tunnels_subdomain, idx_tunnels_status. Written by ssh_server on connect
(deletes previous row for same subdomain first) and on close; request_count/bytes now
write-through updated by tunnel_registry.increment_request_count (v0.3.0 — previously
in-memory only); read by admin dashboard, /tunnels/*, /tokens aggregation, analytics.

## tokens  (multi-tunnel tokens — what the dashboard manages)
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_email | VARCHAR(255) NOT NULL → users(email) ON DELETE CASCADE | FK! renaming a user email requires re-linking token rows |
| token | VARCHAR(64) UNIQUE | 16-hex chars, SSH username |
| name | VARCHAR(120) | label |
| custom_domain | VARCHAR(255) UNIQUE | per-token custom domain |
| fixed_subdomain | VARCHAR(50) UNIQUE | (0019) permanent subdomain; backfilled md5(token)[:7]; SSH reuses it on every connect |
| basic_auth_user / basic_auth_pass | VARCHAR(120) | (0018) HTTP Basic auth enforced by proxy |
| ip_whitelist | TEXT | (0018) comma list of IPs/CIDRs; empty = allow all |
| bearer_key | VARCHAR(64) | (0018) require X-Api-Key / Bearer on every request |
| https_only | BOOLEAN default FALSE | (0018) reject plain HTTP |
| created_at / updated_at | TIMESTAMPTZ | |

Indexes: idx_tokens_user_email, idx_tokens_token.
Current rows (local): 1 — "Default" token for support@callingagents.in (backfilled
from users.tunnel_token in v0.1.1; SSH auth resolves via this table first).
Fresh installs: auto_setup seeds the admin's token into tokens directly since
v0.1.3 (migration 0006's backfill alone missed it because the seed runs after
migrations).

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

Index: idx_payments_user, idx_payments_ref. coupon_code column (0013) records the
promo code applied at checkout; redeemed count increments on payment success.

## audit_logs  (0010 — admin/user action history)
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| actor_email | VARCHAR(255) NOT NULL | who performed the action |
| action | VARCHAR(50) NOT NULL | user.update / user.delete / user.register / ip.block / ip.unblock / ip_monitor.config_update |
| target | VARCHAR(255) | user email / IP / "" |
| details | TEXT | changed field names (password MASKED) / JSON payload |
| created_at | TIMESTAMPTZ | default now() |

Indexes: idx_audit_created (DESC), idx_audit_actor. Written via app/core/audit.py
(fire-and-forget) from users/auth/ip_monitor routers; read by GET /audit + admin page.

## app_settings  (0012 — runtime config; DB value > env default)
| column | type | notes |
|---|---|---|
| key | VARCHAR(64) PK | stripe_secret_key, stripe_webhook_secret, stripe_enabled, paypal_client_id/secret/mode/enabled, nowpayments_api_key/ipn_secret/enabled, public_base_url, pro_price_inr, pro_price_usd (SMTP keys added in 0013) |
| value | TEXT | secrets stored plaintext in DB — admin API always masks them |
| updated_by / updated_at | VARCHAR / TIMESTAMPTZ | last editor (audited) |

Managed by app/core/app_settings.py; read by payments checkout + settings router.

## coupons  (0012 — promo codes)
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| code | VARCHAR(32) UNIQUE | uppercase at create |
| percent_off | INT 1–100 | percent discount at checkout |
| max_redemptions / redeemed | INT / INT | 0 = unlimited; incremented on payment success |
| active / expires_at | BOOLEAN / TIMESTAMPTZ | toggle + expiry |
| created_at | TIMESTAMPTZ | |

Index: idx_coupons_code. Validated at checkout (_apply_coupon), redeemed in
_mark_paid_and_upgrade; admin CRUD in settings router.

## email_logs  (0013 — every outgoing email, sent or failed)
| column | type | notes |
|---|---|---|
| id / to_email / subject | UUID / VARCHAR / VARCHAR | |
| kind | VARCHAR(40) | welcome \| reset \| tunnel_stopped \| campaign \| test |
| status / error | VARCHAR(20) / TEXT | pending \| sent \| failed + reason (e.g. "SMTP not configured") |
| created_at | TIMESTAMPTZ | |

Written by app/core/email.py (every send attempt); read by admin Email Logs.

## password_resets  (0013)
| column | type | notes |
|---|---|---|
| user_email | VARCHAR(255) | |
| token_hash | VARCHAR(64) UNIQUE | SHA-256 of the URL token — raw token never stored |
| expires_at / used_at | TIMESTAMPTZ | 30-min TTL; single-use |

## announcements  (0014)
| column | type | notes |
|---|---|---|
| title / body / level | VARCHAR / TEXT / VARCHAR | level: info \| warning \| success |
| active | BOOLEAN | shown on user dashboard banner when true |

## plans  (0015 — admin-editable pricing; powers landing + checkout)
| column | type | notes |
|---|---|---|
| id | VARCHAR(20) PK | free \| pro \| enterprise |
| name / tagline / cta_label | VARCHAR | display |
| price_inr / price_usd | NUMERIC(10,2) | monthly |
| features | TEXT | newline-separated list |
| popular / active / sort_order | BOOL/BOOL/INT | MOST POPULAR badge, visibility, order |

Seeded free/pro/enterprise. Read by GET /plans (public), edited via admin UI.

## invoices  (0016 — auto-created when a payment turns paid)
| column | type | notes |
|---|---|---|
| invoice_no | VARCHAR(24) UNIQUE | INV-YYYYMM-XXXXXXXX |
| payment_id | UUID UNIQUE | one invoice per payment (idempotent webhook replays) |
| user_email / plan / seats / coupon_code | | snapshot at payment time |
| amount / currency / status | NUMERIC / VARCHAR / paid\|void |
| issued_at | TIMESTAMPTZ | |

## tunnel_configs  (0017 — saved builder configurations)
| column | type | notes |
|---|---|---|
| user_email | VARCHAR(255) | owner |
| name | VARCHAR(120) | user label |
| config | TEXT | JSON blob (preset, local_addr, platform, flags) |

## Non-DB state
- Redis (db 0): per-IP request counters + blocklist for IP monitoring (TTL = window /
  block duration). Flush-safe — purely ephemeral.
- In-memory tunnel registry (app/core/tunnel_registry.py): subdomain → TunnelSession
  (port mapping, live stats, SSH conn reference). Lost on restart; tunnels table is the
  persistent record.
