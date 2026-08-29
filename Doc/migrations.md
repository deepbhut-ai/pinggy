# migrations.md — Alembic tracker

Env: alembic.ini + alembic/env.py (reads settings.DATABASE_URL from app config).
Applied automatically on every startup by auto_setup._run_migrations().

## Next migration number: **0025**

| # | Up file | Down in same file | Change | Status |
|---|---|---|---|---|
| 0022 | 0022_sent_received_bytes.py | DROP 2 cols | tunnels.bytes_sent / bytes_received (per-direction traffic) | applied (local, v1.2.0) |
| 0023 | 0023_domains_teams_tickets.py | DROP 4 tables + col | token_domains, teams, team_members, tickets, ticket_messages, tokens.team_id (multi-domains + teams + tickets) | applied (local, v1.4.0) |
| 0024 | 0024_add_twofa_enabled.py | DROP COLUMN | users.twofa_enabled (2FA email OTP) | applied (local, v1.5.0) |
| 0021 | 0021_tcp_tunnels.py | DROP 2 cols | tokens: tunnel_mode (http|tcp), tcp_port UNIQUE (Pro) | applied (local, v1.0.0) |
| 0014 | 0014_announcements.py | DROP announcements | announcements table + active idx | applied (local, v0.5.0) |
| 0011 | 0011_add_token_to_tunnels.py | DROP idx + col | tunnels.token VARCHAR(64) + idx + backfill from users.tunnel_token | applied (local, v0.3.0) |
| 0010 | 0010_user_active_and_audit_logs.py | DROP audit_logs + is_active col | users.is_active BOOLEAN, audit_logs table + 2 indexes | applied (local, v0.2.0) |

| # | Up file | Down in same file | Change | Status |
|---|---|---|---|---|
| 0001 | 0001_create_users.py | DROP TABLE users | users table + idx_users_email | applied (local + prod) |
| 0002 | 0002_add_role_and_admin.py | DROP COLUMN role | users.role + idx_users_role + seed admin | applied |
| 0003 | 0003_create_tunnels.py | DROP TABLE tunnels | tunnels table + 2 indexes | applied |
| 0004 | 0004_add_tunnel_token.py | DROP COLUMN tunnel_token | users.tunnel_token UNIQUE | applied |
| 0005 | 0005_add_custom_domain.py | DROP COLUMN custom_domain | users.custom_domain UNIQUE | applied |
| 0006 | 0006_create_tokens_table.py | DROP TABLE tokens | tokens table + backfill from users.tunnel_token | applied (⚠ backfill no-op locally: admin seeded after migrations) |
| 0007 | 0007_add_plan_columns.py | DROP plan cols | users.plan, tunnels.tunnel_expires_at | applied |
| 0008 | 0008_add_payments.py | DROP payments + col | users.plan_expires_at, payments table | applied |
| 0009 | 0009_add_seats.py | DROP COLUMN seats | users.seats | applied |

(0001–0009 rows: see git history of this file at v0.1.3 — table above continues)

All migrations use raw SQL via op.execute with IF NOT EXISTS / IF EXISTS guards — idempotent,
safe to re-run on startup. Downgrades exist inline in each file.
No separate .down.sql files (single-file up/down convention in this project).

## schema-version tracking
Alembic's own alembic_version table (SELECT version_num FROM alembic_version; → 0009).
