# functions.md — endpoint & core-function inventory

## Audit
| Function | File | Endpoint | Notes |
|---|---|---|---|
| list_audit | app/api/routers/audit.py | GET /audit?limit=100&offset=0 | admin; newest first |
| log_audit | app/core/audit.py | (internal) | fire-and-forget INSERT; called from users/auth/ip_monitor routers; passwords never logged (field name only) |

## Auth / users
- v1.6.0 API keys: POST /apikeys {name, expiry_days?30|90|null} — plan cap Free 5 / Pro 10 (402/400 at cap), expires_at set at create; resolve_api_key rejects expired (401); list shows expires_at.
- POST /auth/login — password OK; if users.twofa_enabled → {otp_required, challenge} + emailed 6-digit code (Redis otp:{challenge} sha256:email, 5 min); else JWT (v1.5.0)
- POST /auth/verify-otp {challenge, code} → JWT; one-time challenge, 401 on wrong/expired
- GET/PUT /auth/2fa {enabled} — own 2FA toggle (audit auth.2fa)
| Function | File:line | Signature → returns | Side effects | Called by (pages/clients) |
|---|---|---|---|---|
| register | app/api/routers/auth.py:16 | POST /auth/register {email,password,full_name} → 201 Token(access_token,user,tunnel_token) | INSERT users (role forced 'user', random tunnel_token) | login.html sign-up tab |
| login | auth.py:56 | POST /auth/login {email,password} → Token | reads users | login.html, admin.html, dashboard.html |
| me | auth.py:83 | GET /auth/me → UserOut | — | admin.html, dashboard.html |
| get_tunnel_token | auth.py:97 | GET /auth/tunnel-token → {tunnel_token} | reads users | dashboard.html |
| regenerate_tunnel_token | auth.py:109 | POST /auth/regenerate-token → {tunnel_token} | UPDATE users.tunnel_token | dashboard.html |
| list_users / get_user / update_user / delete_user | users.py:16/31/47/149 | GET/PUT/DELETE /users(/{user_id}) | admin CRUD | admin.html |
| update_my_custom_domain | users.py:176 | PUT /users/me/custom-domain | UPDATE users.custom_domain | dashboard.html |
| get_user_tunnels | users.py:217 | GET /users/{user_id}/tunnels | reads tunnels | admin.html |

## Email / announcements / password reset
| Function | File | Endpoint | Notes |
|---|---|---|---|
| forgot_password / reset_password | auth.py | POST /auth/forgot-password, POST /auth/reset-password | SHA-256 hashed single-use 30-min tokens; no account enumeration; audited |
| send_email / send_template / smtp_configured | app/core/email.py | (internal) | SMTP via app_settings; logs to email_logs; best-effort |
| announcements CRUD / campaign / logs / smtp-status | announcements.py | /announcements* | campaign gated 503 until SMTP configured; audited |

## Settings / coupons
| Function | File | Endpoint | Notes |
|---|---|---|---|
| get_settings_view / update_settings | app/api/routers/settings.py | GET/PUT /settings | masked secrets + source badges; audited |
| coupons CRUD | settings.py | /settings/coupons* | percent 1-100, max 0=∞; audited |
| get_setting / set_setting / payment_method_enabled | app/core/app_settings.py | (internal) | DB > env resolution |
| _apply_coupon / validate_coupon_endpoint | payments.py | POST /payments/coupon/validate | returns discounted INR preview |

## Analytics
| Function | File | Endpoint | Notes |
|---|---|---|---|
| analytics_overview | app/api/routers/analytics.py | GET /analytics/overview?days=30 | admin; generate_series daily + 12-month monthly LEFT JOIN aggregations + today/month summary |

## Tunnels / tokens

### Teams (v1.4.0 — app/api/routers/teams.py)
- v1.7.0 role control: get_team_role() → owner (teams.owner_email) > admin > member.
- PATCH /teams/{id}/members/{email} {role} — owner-only promote/demote (owner row immutable).
- PUT /tokens/{id}/team {team_id|null} — share/unshare token with a team (owner or team-admin); GET /teams returns my_role + team tokens; GET /tokens returns shared tokens (via_team, read-only for members).
- Guards on PUT/DELETE /tokens/{id}: owner/team_owner/team_admin pass, plain member → 403 read-only (platform admin bypasses).
- GET /teams → owned + member teams w/ members + i_own | POST /teams {name} (owner auto-admin)
- POST /teams/{id}/members {email,role} — team-admin only; 404 if email not registered; 409 dup
- DELETE /teams/{id}/members/{email} — owner or self; owner protected | DELETE /teams/{id} — owner only; tokens.team_id → NULL
- Audit: team.create / team.add_member / team.remove_member / team.delete

### Tickets (v1.4.0 — app/api/routers/tickets.py)
- POST /tickets {subject,message} (first message) | GET /tickets/my | GET /tickets/{id} (owner or admin)
- POST /tickets/{id}/reply — user reply → open; admin (is_staff) reply → answered + best-effort email to owner
- POST /tickets/{id}/close — owner or admin | GET /tickets/admin/all?status= (admin)
- Audit: ticket.create

### Extra token domains (v1.4.0 — app/api/routers/tokens.py)
- POST /tokens/{id}/domains {domain} — Pro only, max 3 extras, unique platform-wide; DELETE /tokens/{id}/domains/{domain}
- TokenOut.domains lists extras; SSH auth loads them into TunnelSession.custom_domains; get_tunnel_by_custom_domain matches primary + extras (Host, `:port` stripped)
| Function | File | Endpoint | Notes |
|---|---|---|---|
| tunnel_info | tunnels.py:14 | GET /tunnels/info | SSH instructions; any logged-in user |
| my_tunnels | tunnels.py:35 | GET /tunnels/my | active tunnels of current user (registry, filtered by email) |
| list_active_tunnels | tunnels.py:65 | GET /tunnels | ALL active tunnels (admin, registry) |
| tunnel_history | tunnels.py:93 | GET /tunnels/history?limit=50 | DB rows incl. closed (admin) — used by admin.html All Tunnels view |
| stop_tunnel (admin) | tunnels.py:127 | DELETE /tunnels/{subdomain} | force-stop any tunnel (admin): close SSH + mark row disconnected |
| user_stop_tunnel | tunnels.py:152 | POST /tunnels/{subdomain}/stop | stop OWN tunnel only (ownership check, 403 otherwise) |
| tunnel_stats | tunnels.py:181 | GET /tunnels/stats | totals: users, tunnels, active, requests, bytes (admin) |
| list/create/update/delete/regenerate token | tokens.py:63/88/146/218/236 | /tokens CRUD | responses include per-token traffic (total_requests/total_bytes/active_tunnels via _token_traffic) |
| admin token variants | tokens.py:282/310/327 | /tokens/admin/* | get_admin_user |

## Payments
| Function | File | Endpoint | Notes |
|---|---|---|---|
| checkout | payments.py:90 | POST /payments/checkout | Stripe/PayPal/NowPayments per *_ENABLED; writes payments(pending) |
| stripe_webhook / paypal_webhook / nowpayments_webhook | payments.py:160/247/310 | POST /payments/webhook/* | public; verify signature; payments→paid; users.plan='pro', plan_expires_at+30d |
| paypal_capture | payments.py:263 | GET /payments/paypal/capture/{order_id} | success redirect target (PUBLIC_BASE_URL) |
| my_payments / admin_all / admin_stats | payments.py:339/376/411 | GET /payments/my, /payments/admin/* | auth / admin |

## IP monitor
| Function | File | Endpoint | Notes |
|---|---|---|---|
| stats/ips/ip_detail | ip_monitor.py:33/41/54 | GET /ip-monitor/… | Redis-backed |
| block/unblock/blocked | ip_monitor.py:73/87/101 | POST /ip-monitor/block … | admin |
| geo_lookup / config | ip_monitor.py:110/122 | POST /ip-monitor/geo/{ip} | ip-api.com |

## Core
| Function | File | Purpose |
|---|---|---|
| run_auto_setup | app/core/auto_setup.py:149 | DB create + pgcrypto + migrations + seed admin |
| start_ssh_server | app/core/ssh_server.py:389 | asyncssh server on SSH_PORT, token auth, subdomain allocation, tunnel registry + DB writes |
| MySSHServer.begin_auth / _verify_tunnel_token_sync | ssh_server.py:199/250 | token check: tokens table → users fallback |
| _setup_tunnel | ssh_server.py:321 | subdomain allocation, registry insert, tunnels row upsert |
| TunnelProxyMiddleware.dispatch / _extract_subdomain | app/core/proxy.py:44/23 | Host-header routing → httpx forward to remote_port |
| register_tunnel / remove_tunnel / get_tunnel / get_tunnel_by_custom_domain / increment_request_count / log_to_tunnel / is_subdomain_taken | app/core/tunnel_registry.py | in-memory registry + live stats |
| IPMonitorMiddleware.dispatch | app/core/ip_monitor.py | Redis sliding-window rate counting + auto-block |
| init_pool / get_db | app/core/db.py | async psycopg pool + FastAPI dependency |
| init_redis / close_redis | app/core/redis.py | redis client |
| create_access_token / hash_password / verify_password | app/core/security.py | JWT HS256 / bcrypt |
| get_current_user / get_admin_user | app/core/deps.py | JWT decode → user dict / role gate |
| landing/login/admin/dashboard pages | app/api/routers/admin.py:19-38 | serve app/static/*.html |
