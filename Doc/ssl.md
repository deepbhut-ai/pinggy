Here's the complete flow I'll implement:

## Full Flow — Automatic SSL for Custom Domains (No Restart, No Downtime)

### Step 1: User adds a domain from Dashboard
```
User → Domains page → "Add Domain" → enters callingagents.in
```

### Step 2: Backend verifies DNS
```
Backend checks: Does callingagents.in A record → 13.140.131.204?
  → YES: proceed to Step 3
  → NO: tell user "Point your DNS A record to 13.140.131.204"
```

### Step 3: Backend runs Certbot (gets SSL cert — no nginx restart)
```
Backend runs: certbot certonly --webroot -w /var/www/certbot -d callingagents.in
  → Certbot places a verification file in /var/www/certbot/.well-known/acme-challenge/
  → Let's Encrypt verifies via HTTP (nginx already serves this path)
  → SSL cert saved to /etc/letsencrypt/live/callingagents.in/
  → Takes ~5-10 seconds
  → No nginx restart, no backend restart
```

### Step 4: Backend generates nginx config for that domain
```
Backend creates: /etc/nginx/sites-available/custom-callingagents.in
  → Server block with listen 443 ssl
  → ssl_certificate path to the Let's Encrypt cert
  → Proxies to FastAPI (same as tunnel proxy)
  → Symlinks to sites-enabled
```

### Step 5: Graceful nginx reload (no downtime)
```
Backend runs: nginx -t (test config) && nginx -s reload
  → nginx reloads config gracefully
  → Active connections stay alive
  → New connections use the new config
  → Zero downtime
```

### Step 6: Domain is now live with HTTPS
```
Browser → HTTPS → Nginx (443, SSL) → FastAPI TunnelProxy → SSH tunnel → User's localhost
```

### What happens when user removes a domain:
```
1. Backend removes the nginx config file
2. nginx -s reload (graceful)
3. certbot delete --cert-name callingagents.in (cleanup)
```

### What happens on cert renewal:
```
1. Certbot auto-renews (cron job, every 60 days)
2. After renewal: nginx -s reload (graceful)
3. No manual intervention needed
```

---

## What I need to set up first (one-time):

1. **Create webroot directory** for certbot verification: `/var/www/certbot`
2. **Add ACME challenge location** to nginx catch-all config (so Let's Encrypt can verify domains)
3. **Install certbot** if not already installed
4. **Create a backend API endpoint** that:
   - Verifies DNS
   - Runs certbot
   - Generates nginx config
   - Reloads nginx
5. **Auto-renewal** — set up certbot renew cron with nginx reload hook

### Key points — no disturbance:
- `nginx -s reload` = **graceful** (no connection drop, no downtime)
- Backend (FastAPI) = **never restarted** (just runs certbot + nginx commands in background)
- SSH tunnels = **not affected** (they stay connected throughout)
- Users on the site = **not affected** (page keeps working)

Shall I implement this now?