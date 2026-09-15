# IRAGT WebSocket Data Frame Forwarding Issue

## Problem Summary

**IRAGT SSH reverse tunnels (ssh.iraglobaltech.com:2222) do NOT properly forward WebSocket data frames** after the HTTP upgrade handshake. This breaks Twilio ConversationRelay, which requires sustained bidirectional WebSocket communication for AI voice calls.

## Affected Service

- **Zetta_Live** (Django Daphne on port 8010) — AI voice agent
- **Domain:** `code.zettalgor.com` → IRAGT edge `13.140.131.204`
- **WebSocket endpoint:** `wss://code.zettalgor.com/ws/audio/` (Twilio ConversationRelay)
- **IRAGT tunnel token:** `db5f8bb0a9ffb2ea@ssh.iraglobaltech.com`

## What Works

✅ HTTP requests through IRAGT (GET, POST) — TwiML webhooks (`/twilio/voice/`, `/twilio/callback/`) return correct responses
✅ WebSocket HTTP upgrade handshake — IRAGT returns `HTTP 101 Switching Protocols`
✅ TCP connectivity — the SSH tunnel connects and stays alive

## What Does NOT Work

❌ WebSocket **data frames** after the upgrade — Twilio's ConversationRelay connects (HTTP 101), but the "setup" message never reaches Daphne. The connection drops after ~10 seconds with 0 messages received.

## Evidence

### ws_debug.log (Daphne side) — IRAGT tunnel (BROKEN):

```
2026-09-15 12:07:06,721 CONNECT scope_user=None path=/ws/audio/
2026-09-15 12:07:16,712 DISCONNECT close_code=1006 call_ended=False msgs_received=0 last_user=''

2026-09-15 12:07:56,527 CONNECT scope_user=None path=/ws/audio/
2026-09-15 12:08:06,526 DISCONNECT close_code=1006 call_ended=False msgs_received=0 last_user=''

2026-09-15 12:29:56,012 CONNECT scope_user=None path=/ws/audio/
2026-09-15 12:29:56,301 DISCONNECT close_code=1000 call_ended=False msgs_received=0 last_user=''
```

**Every connection:** CONNECT → DISCONNECT after 10s, `msgs_received=0` (no setup/prompt messages from Twilio)

### ws_debug.log — Pinggy tunnel (WORKING, Aug 25):

```
2026-08-25 09:08:24,079 CONNECT scope_user=None path=/ws/audio/
2026-08-25 09:08:24,491 RECV #1 type=setup raw='{"type":"setup","sessionId":"VX46c66942f72fec50890305efd82a9abb","callSid":"CA7a5537142bdc3489f31cb8061bb296ce",...}'
2026-08-25 09:08:24,492 SETUP callSid=CA7a5537142bdc3489f31cb8061bb296ce
2026-08-25 09:08:35,987 RECV #2 type=prompt raw='{"type":"prompt","voicePrompt":"Can you tell me more about your services?",...}'
2026-08-25 09:08:51,226 RECV #3 type=prompt raw='{"type":"prompt","voicePrompt":"Can you explain how your AI calls are working?",...}'
...
2026-08-25 09:10:13,655 DISCONNECT close_code=1000 call_ended=True msgs_received=7 last_user="Let's book a demo today, 9 10 AM."
```

**Full conversation:** 7 messages received, AI responded, call completed normally.

### Network Path Comparison

|                                    | IRAGT (BROKEN)                                          | Pinggy (WORKING)                                       |
| ---------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| **Tunnel type**              | SSH reverse tunnel (`ssh -p 2222 -R0:127.0.0.1:8010`) | SSH reverse tunnel (`ssh -p 443 -R0:127.0.0.1:8010`) |
| **Server**                   | `ssh.iraglobaltech.com:2222` → `13.140.131.204`    | `pro.pinggy.io:443` → `45.118.134.87`             |
| **Token**                    | `db5f8bb0a9ffb2ea@ssh.iraglobaltech.com`              | `27HGa0QKadE+force@pro.pinggy.io`                    |
| **HTTP upgrade**             | ✅ 101 Switching Protocols                              | ✅ 101 Switching Protocols                             |
| **WebSocket data frames**    | ❌ Not forwarded                                        | ✅ Properly forwarded                                  |
| **Twilio ConversationRelay** | ❌ "Application error, goodbye"                         | ✅ Full AI conversation                                |
| **Server header**            | `Server: nginx/1.24.0 (Ubuntu)` (IRAGT edge)          | Pinggy edge                                            |

### Test Results

```bash
# IRAGT: HTTP upgrade works, but WebSocket data doesn't flow
curl -sk --resolve "code.zettalgor.com:443:13.140.131.204" --http1.1 \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  "https://code.zettalgor.com/ws/audio/"
# → HTTP 101 (upgrade succeeds, but no data frames forwarded)

# Pinggy: Full WebSocket works
curl -sk --http1.1 \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  "https://znwpyberwv.a.pinggy.link/ws/audio/"
# → HTTP 101 (upgrade succeeds, data frames properly forwarded)
```

## Root Cause (CONFIRMED 2026-09-15)

### The IRAGT edge forces HTTP/2 and returns 403 Forbidden for WebSocket upgrades

**Test results (2026-09-15 14:43 UTC):**

```bash
# Test 1: IRAGT with HTTP/1.1 (WebSocket upgrade)
curl -sk --resolve "code.zettalgor.com:443:13.140.131.204" --http1.1 -v \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  "https://code.zettalgor.com/ws/audio/"
# Result: HTTP/1.1 403 Forbidden
# Server: nginx/1.24.0 (Ubuntu)
# The IRAGT nginx REJECTS the WebSocket upgrade with 403!

# Test 2: IRAGT without forcing HTTP/1.1 (default)
curl -sk --resolve "code.zettalgor.com:443:13.140.131.204" -v \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  "https://code.zettalgor.com/ws/audio/"
# Result: ALPN: server accepted h2 (HTTP/2)
# The IRAGT edge forces HTTP/2, which does NOT support the WebSocket Upgrade header
# The Upgrade: websocket header is silently ignored in HTTP/2
# Twilio ConversationRelay cannot connect

# Test 3: Python raw socket test (HTTP/1.1 forced)
# Upgrade response: HTTP/1.1 403 Forbidden
# The IRAGT nginx returns 403 for WebSocket upgrade requests
# Even after sending a WebSocket data frame, nginx returns 400 Bad Request
```

### Three confirmed problems on the IRAGT edge (`13.140.131.204`):

1. **HTTP/2 is forced via ALPN** — `ALPN: server accepted h2`. HTTP/2 does NOT support the `Upgrade: websocket` mechanism (RFC 6455). WebSocket over HTTP/2 requires Extended CONNECT (RFC 8441), which nginx 1.24.0 does NOT support.
2. **HTTP/1.1 WebSocket upgrade returns 403 Forbidden** — When a client forces HTTP/1.1 (`--http1.1`), the IRAGT nginx returns `403 Forbidden` instead of `101 Switching Protocols`. This means the nginx config is actively **blocking** WebSocket upgrades, not just failing to forward data.
3. **The 101 responses seen earlier were from a different path** — Earlier tests that showed `HTTP 101` were going through `/etc/hosts` (127.0.0.1 → Caddy → Daphne), NOT through the IRAGT edge. The direct IRAGT test (`--resolve` to `13.140.131.204`) shows 403.

### Network architecture:

```
Twilio servers (HTTP/2)
    │
    ▼ DNS: code.zettalgor.com → 13.140.131.204 (IRAGT edge)
    │
    ▼ TLS handshake: ALPN negotiation
    │
    ▼ IRAGT edge accepts h2 (HTTP/2)
    │
    ▼ Twilio sends GET /ws/audio/ with Upgrade: websocket
    │
    ▼ HTTP/2 ignores Upgrade header → no WebSocket upgrade
    │
    ✗ Twilio ConversationRelay fails → "Application error, goodbye"
```

### Why Pinggy works but IRAGT doesn't:

```
Pinggy edge (45.118.134.87)
    │
    ▼ TLS handshake: ALPN negotiation
    │
    ▼ Pinggy accepts http/1.1 (NOT h2)
    │
    ▼ Client sends GET /ws/audio/ with Upgrade: websocket
    │
    ▼ HTTP/1.1 supports Upgrade → 101 Switching Protocols
    │
    ▼ WebSocket data frames flow bidirectionally
    │
    ✓ Twilio ConversationRelay connects, AI conversation works
```

## Impact

- **Twilio AI voice calls fail** — "Application error, goodbye" on every call
- **All outbound AI calls through IRAGT are broken** — this is the core calling feature
- **HTTP-only endpoints work** — TwiML webhooks, API calls, etc. work fine

## Current Workaround

Using a **Pinggy tunnel** (`27HGa0QKadE+force@pro.pinggy.io`) for port 8010 alongside the IRAGT tunnel:

- IRAGT handles HTTP webhooks (TwiML, callbacks)
- Pinggy handles WebSocket (ConversationRelay data frames)
- TwiML `PROJECT_WSS_BASE_URL` changed to `wss://znwpyberwv.a.pinggy.link`

## What Needs to Be Fixed on the IRAGT Server

### Fix 1: Disable HTTP/2 for WebSocket routes (RECOMMENDED)

The IRAGT edge nginx must NOT force HTTP/2 for WebSocket connections. Either:

**Option A: Disable HTTP/2 entirely for the code.zettalgor.com vhost:**

```nginx
server {
    listen 443 ssl;  # Remove "http2" directive — do NOT add "http2 on;"
    # ... rest of config
}
```

**Option B: Use a separate server block for WebSocket routes that doesn't enable HTTP/2:**

```nginx
# WebSocket server block — no HTTP/2
server {
    listen 443 ssl;
    server_name code.zettalgor.com;
  
    # WebSocket routes
    location /ws/ {
        proxy_pass http://127.0.0.1:<tunnel_port>;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
  
    # Regular HTTP routes (can use HTTP/2)
    location / {
        proxy_pass http://127.0.0.1:<tunnel_port>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Option C: Use nginx `grpc_pass` with WebSocket support (nginx 1.24+):**
Not recommended — grpc_pass is for gRPC, not WebSocket.

### Fix 2: Remove the 403 Forbidden block

The IRAGT nginx is returning `403 Forbidden` for HTTP/1.1 WebSocket upgrade requests. This means there's likely an `if` block or `deny` directive blocking WebSocket. Check for:

```nginx
# REMOVE any of these if they exist:
if ($http_upgrade = websocket) { return 403; }  # Block WebSocket
deny all;  # Too broad
# Or a missing location /ws/ block that falls through to a deny rule
```

### Fix 3: Ensure ALPN advertises http/1.1 (not just h2)

The TLS ALPN negotiation on the IRAGT edge must offer `http/1.1` alongside `h2`:

```nginx
# In the nginx SSL config:
ssl_protocols TLSv1.2 TLSv1.3;
# The ALPN should offer both h2 and http/1.1
# nginx does this by default when both listen 443 ssl and http2 are configured
# But if only http2 is enabled, clients can't fall back to HTTP/1.1
```

### Verification after fix:

```bash
# This should return 101 Switching Protocols (not 403):
curl -sk --resolve "code.zettalgor.com:443:13.140.131.204" --http1.1 \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  "https://code.zettalgor.com/ws/audio/"
# Expected: HTTP/1.1 101 Switching Protocols

# This should also work (Twilio uses HTTP/2, but ALPN should fall back to http/1.1 for WebSocket):
curl -sk --resolve "code.zettalgor.com:443:13.140.131.204" \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  "https://code.zettalgor.com/ws/audio/"
# Expected: HTTP/1.1 101 Switching Protocols (ALPN falls back to http/1.1)
```

## Environment Details

| Item                     | Value                                                   |
| ------------------------ | ------------------------------------------------------- |
| IRAGT server             | `ssh.iraglobaltech.com:2222` (IP: `13.140.131.204`) |
| IRAGT edge nginx         | `nginx/1.24.0 (Ubuntu)`                               |
| IRAGT token (port 8010)  | `db5f8bb0a9ffb2ea`                                    |
| Pinggy server            | `pro.pinggy.io:443` (IP: `45.118.134.87`)           |
| Pinggy token (port 8010) | `27HGa0QKadE+force`                                   |
| Pinggy URL               | `znwpyberwv.a.pinggy.link`                            |
| Local service            | Daphne on `127.0.0.1:8010` (Django ASGI)               |
| Twilio account SID       | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`                  |
| Twilio from number       | `+1xxxxxxxxxx`                                        |
| Test call to             | `+91xxxxxxxxxx` (Disha)                               |
| TwiML voice template     | `uYkKk3J4lEp7IHQ8CLBi` (ElevenLabs voice)             |

## Contact

- **IRAGT dashboard:** https://iraglobaltech.com/dashboard/tokens
- **Twilio console:** https://console.twilio.com/
- **CallingAgents contacts:** https://callingagents.in/customer_contacts/list