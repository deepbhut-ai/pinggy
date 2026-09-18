# Fleet 33 Subdomains — 502 on HTTPS (IRAGT Edge Nginx Not Configured)

## TL;DR

33 CodeCanyon backend apps are running locally and connected via IRAGT SSH tunnels, but the IRAGT edge server returns **502 Bad Gateway** on HTTPS 443 for all 33 new subdomains. The edge's nginx has server blocks only for **old** subdomains (erp, website, marketing, etc.) — the **33 new ones** are missing. An IRAGT support ticket has been submitted. Everything else (DNS, tokens, tunnels, local apps, nginx proxy) is fully configured and working.

---

## Architecture

```
User → HTTPS → Cloudflare (DNS-only, no proxy) → IRAGT Edge (13.140.131.204:443)
  → edge nginx (HTTPS termination + domain routing) → SSH tunnel → local nginx proxy (9041-9077) → PHP app (8041-8077)
```

- **IRAGT edge**: `13.140.131.204`, SSH server at `ssh.iraglobaltech.com:2222`
- **Local machine**: M2 Ultra macOS, all apps run locally
- **nginx fleet proxy**: `127.0.0.1:9041-9077` → injects `Host: <name>.callingagents.in` + `X-Forwarded-Proto: https` header before forwarding to the app on `8041-8077`
- **Cloudflare**: SSL mode = **Flexible** (CF→edge is HTTP), DNS records are **DNS-only** (grey cloud, not proxied) so the edge sees the real A record IP

---

## What's Working ✅

### 1. All 34 backend apps running locally

- `start_cc.py` at `/Volumes/Storage/DRIVE/CAS/codecanyon_downloads/start_cc.py` starts all 34 apps
- Ports 8041–8077 (33 backends + 1 dashboard at 8073)
- Status: **34/34 🟢 UP**
- Three PHP binaries: php@8.3 (default), php 8.5 (rith, instikit), custom x86 ionCube PHP (infixlms)
- Verify: `cd /Volumes/Storage/DRIVE/CAS/codecanyon_downloads && python3 start_cc.py --status`

### 2. All 33 IRAGT tunnels connected

- SSH reverse tunnels: `ssh -p 2222 -R 0:127.0.0.1:<port> <token>@ssh.iraglobaltech.com`
- 33/33 tunnels active (confirmed via IRAGT API: `active_tunnels=1` per token)
- Tokens stored in `_tools/fleet-tunnels.tsv` (name, localport, token, edgeport)
- Edge ports allocated dynamically and persisted in `_tools/fleet-edgeports.tsv`
- Verify: `python3 start_cc.py --status` shows `tunnel=🟢` for all 33

### 3. All 33 Cloudflare DNS A records created

- Zone: `callingagents.in` (Cloudflare zone ID: `73165ca7d57998a3c45dba5f4d38042c`)
- 33 A records: `<name>.callingagents.in` → `13.140.131.204`
- **DNS-only** (grey cloud, NOT proxied) — so the IRAGT edge sees the real IP
- Verify: `dig +short astrology.callingagents.in A` → `13.140.131.204`

### 4. IRAGT domain verification passes

- `GET /api/v1/users/me/verify-domain?domain=astrology.callingagents.in` returns:
  ```json
  {"status": "ok", "message": "✅ astrology.callingagents.in is verified and reaching this server"}
  ```
- All 33 subdomains pass verification.

### 5. All 33 IRAGT tokens configured

- Each token has: `tunnel_mode=http`, `local_port=<direct app port>`, `custom_domain=<name>.callingagents.in`
- API key: `pk__eiUVfvccfT0WN90YtWGClVKq0-StVXsSKlMrbeZNJI`
- Verify: `curl -s -H "X-Api-Key: pk__eiUVfvccfT0WN90YtWGClVKq0-StVXsSKlMrbeZNJI" https://iraglobaltech.com/api/v1/tokens | python3 -m json.tool`

### 6. nginx fleet proxy working locally

- Config: `/opt/homebrew/etc/nginx/servers/fleet.callingagents.conf`
- 33 server blocks: `listen 127.0.0.1:9041` → `proxy_pass http://127.0.0.1:8041` + `Host: astrology.callingagents.in`
- Verify: `curl -s -o /dev/null -w "%{http_code}" -H "Host: astrology.callingagents.in" http://127.0.0.1:9041/` → `200`

### 7. start_cc.py fully updated

- Flags: `--status`, `--stop`, `--start` (default), `--watchdog`, `--tunnels-only`, `--apps-only`
- Watchdog: monitors every 30s, restarts dead apps + tunnels
- Tunnel management: reads `fleet-edgeports.tsv`, allocates fresh ports via `-R 0`, persists them
- File: `/Volumes/Storage/DRIVE/CAS/codecanyon_downloads/start_cc.py`

---

## What's Broken ❌

### 502 Bad Gateway on HTTPS 443 for all 33 new subdomains

**Symptom:**

```bash
curl -sk -o /dev/null -w "%{http_code}" https://astrology.callingagents.in/
# Returns: 502
```

**Edge HTTP port 80:**

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Host: astrology.callingagents.in" http://13.140.131.204/
# Returns: 301 → https://astrology.callingagents.in/  (edge redirects HTTP→HTTPS)
```

**Edge HTTPS port 443:**

```bash
curl -sk -o /dev/null -w "%{http_code}" -H "Host: astrology.callingagents.in" https://13.140.131.204/
# Returns: 502  (edge nginx can't find upstream for this domain)
```

### Root Cause

The IRAGT edge server's **nginx config does not have server blocks for the 33 new subdomains**. Only the old subdomains (created during the original v0.10.0 setup) have nginx server blocks:

| Subdomain                   | Created       | HTTP (port 80)         | HTTPS (port 443)   | Status    |
| --------------------------- | ------------- | ---------------------- | ------------------ | --------- |
| erp.callingagents.in        | Old (v0.10.0) | 200 (proxies directly) | 302 (app responds) | ✅ Works  |
| website.callingagents.in    | Old           | 200                    | 200                | ✅ Works  |
| marketing.callingagents.in  | Old           | 200                    | 200                | ✅ Works  |
| astrology.callingagents.in  | New (API)     | 301→HTTPS             | 502                | ❌ Broken |
| socialvibe.callingagents.in | New           | 301→HTTPS             | 502                | ❌ Broken |
| (all 33 new)                | New           | 301→HTTPS             | 502                | ❌ Broken |

**Key observation:** The old subdomains' port 80 blocks proxy directly to the tunnel (return 200). The new subdomains' port 80 blocks redirect to HTTPS (301). On HTTPS 443, the old domains route to the tunnel (200/302) but the new domains return 502 (no upstream configured).

### What was tried (didn't fix it)

1. ✅ Created IRAGT tokens via API (`POST /api/v1/tokens`)
2. ✅ Set `tunnel_mode=http` via API (`PUT /api/v1/tokens/{id}` with `{"tunnel_mode":"http"}`)
3. ✅ Set `local_port` via API (`PUT /api/v1/tokens/{id}` with `{"local_port":8041}`)
4. ✅ Verified domain via API (`GET /api/v1/users/me/verify-domain?domain=...`) → `status: "ok"`
5. ✅ Connected SSH tunnel (`ssh -p 2222 -R 0:127.0.0.1:8041 <token>@ssh.iraglobaltech.com`)
6. ✅ Confirmed `active_tunnels=1` via API
7. ✅ Waited 2+ minutes for edge propagation
8. ✅ Changed Cloudflare SSL from Flexible → Full → back to Flexible
9. ✅ Changed Cloudflare DNS from Proxied (orange) → DNS-only (grey)
10. ✅ Changed tunnel target from nginx proxy (9041) → direct app port (8041)
11. ✅ Deleted and recreated tokens via API
12. ✅ Explored IRAGT dashboard (Configure Tunnel, Domains, Manage Tokens, Inspector pages)
13. ❌ The IRAGT API does NOT auto-configure the edge's nginx server blocks for new tokens
14. ✅ Submitted support ticket via IRAGT dashboard

---

## The 33 Subdomains That Need Edge Nginx Config

```
astrology.callingagents.in       → local port 8041
socialvibe.callingagents.in      → local port 8042
eclassify.callingagents.in       → local port 8043
infixlms.callingagents.in        → local port 8044
yoori1.callingagents.in          → local port 8045
infyhms.callingagents.in         → local port 8046
rith.callingagents.in            → local port 8047
acelle.callingagents.in          → local port 8048
teleman.callingagents.in         → local port 8049
magicai.callingagents.in         → local port 8050
erpgo.callingagents.in           → local port 8051
cloudoffice.callingagents.in     → local port 8052
infycare.callingagents.in        → local port 8053
maildoll.callingagents.in        → local port 8054
stackposts.callingagents.in      → local port 8055
jobpilot.callingagents.in        → local port 8056
phprank.callingagents.in         → local port 8057
instikit.callingagents.in        → local port 8058
bedrive.callingagents.in         → local port 8059
zillapage.callingagents.in       → local port 8060
phpanalytics.callingagents.in    → local port 8061
yoori2.callingagents.in          → local port 8062
activeecom.callingagents.in      → local port 8063
whatsmark.callingagents.in       → local port 8064
larabuilder.callingagents.in     → local port 8065
xerochat.callingagents.in        → local port 8066
unimatrix.callingagents.in       → local port 8067
wowonder.callingagents.in        → local port 8068
quickdate1.callingagents.in      → local port 8069
quickdate2.callingagents.in      → local port 8070
architect.callingagents.in       → local port 8071
porto.callingagents.in           → local port 8072
webifly.callingagents.in         → local port 8077
```

---

## IRAGT Credentials

- **Dashboard**: https://iraglobaltech.com/dashboard
- **Email**: support@iraglobaltech.com
- **Password**: Login@2026
- **API Key**: `pk__eiUVfvccfT0WN90YtWGClVKq0-StVXsSKlMrbeZNJI`
- **Edge IP**: 13.140.131.204
- **SSH**: `ssh -p 2222 <token>@ssh.iraglobaltech.com`
- **API base**: `https://iraglobaltech.com/api/v1`

## Cloudflare Credentials

- **Dashboard**: https://dash.cloudflare.com/22076872867b8c6efbe775f208180e76/callingagents.in/dns/records
- **Zone ID**: `73165ca7d57998a3c45dba5f4d38042c`
- **Account ID**: `22076872867b8c6efbe775f208180e76`
- **SSL mode**: Flexible (correct for IRAGT edge)
- **DNS records**: DNS-only (grey cloud, not proxied) for all fleet subdomains

## IRAGT API Endpoints

```
GET    /api/v1/tokens                    — list all tokens (X-Api-Key header)
POST   /api/v1/tokens                    — create token {name, custom_domain}
PUT    /api/v1/tokens/{id}               — update token {tunnel_mode, local_port, ...}
DELETE /api/v1/tokens/{id}               — delete token
GET    /api/v1/users/me/verify-domain?domain=X  — verify domain DNS
GET    /api/v1/openapi.json              — OpenAPI spec
```

## Key Files

- **start_cc.py**: `/Volumes/Storage/DRIVE/CAS/codecanyon_downloads/start_cc.py` — main launcher (apps + tunnels + watchdog)
- **fleet-tunnels.tsv**: `/Volumes/Storage/DRIVE/CAS/codecanyon_downloads/_tools/fleet-tunnels.tsv` — name, port, token
- **fleet-edgeports.tsv**: `/Volumes/Storage/DRIVE/CAS/codecanyon_downloads/_tools/fleet-edgeports.tsv` — name, port, token, edgeport
- **nginx fleet config**: `/opt/homebrew/etc/nginx/servers/fleet.callingagents.conf` — 33 server blocks (9041-9077 → 8041-8077)
- **backend-store.php**: `/Volumes/Storage/DRIVE/CAS/Serveraira/config/backend-store.php` — 34-entry registry for Serveraira's Backend Store modal

## How to Verify the Fix

Once IRAGT configures the edge nginx, test:

```bash
# Should return 200/301/302 (not 502)
curl -sk -o /dev/null -w "%{http_code}" https://astrology.callingagents.in/

# Test all 33
for sub in astrology socialvibe eclassify infixlms yoori1 infyhms rith acelle teleman magicai erpgo cloudoffice infycare maildoll stackposts jobpilot phprank instikit bedrive zillapage phpanalytics yoori2 activeecom whatsmark larabuilder xerochat unimatrix wowonder quickdate1 quickdate2 architect porto webifly; do
  code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "https://$sub.callingagents.in/")
  echo "$sub → $code"
done
```

## How to Boot Everything After the Fix

```bash
# Single command — starts all apps + tunnels + watchdog
cd /Volumes/Storage/DRIVE/CAS/codecanyon_downloads
python3 start_cc.py --watchdog

# Or just apps + tunnels (no watchdog):
python3 start_cc.py

# Status check:
python3 start_cc.py --status
```

## Support Ticket

Submitted via IRAGT dashboard → Support page on 2026-09-15. Requesting:

> Configure nginx server blocks for all 33 new *.callingagents.in subdomain tokens. They return 502 on HTTPS 443. DNS, tokens, tunnels, and domain verification are all configured correctly. The issue is the edge's nginx doesn't have server blocks for the new subdomains (only old ones like erp, website, marketing work).