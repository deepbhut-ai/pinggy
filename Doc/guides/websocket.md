# WebSocket Tunnel Guide

IRAGT supports WebSocket connections through your tunnels. This guide explains
how WebSocket works, how to configure it, and important server-side requirements.

## How WebSocket Tunnels Work

```
Client (browser/Twilio)
    │
    ▼ HTTPS (HTTP/1.1)
    │
    ▼ nginx (terminates TLS, proxies to IRAGT on :8000)
    │
    ▼ IRAGT FastAPI (tunnel_websocket ASGI route)
    │
    ▼ websockets.connect() to ws://127.0.0.1:<remote_port>
    │
    ▼ SSH reverse tunnel (SSH -R0:localhost:<local_port>)
    │
    ▼ Your local service (Daphne, uvicorn, Node.js, etc.)
```

The IRAGT proxy bridges the client's WebSocket to your local service through
the SSH reverse tunnel. Data frames flow bidirectionally:

- **Client → upstream:** `pump_down` reads ASGI `websocket.receive` events and
  forwards them to the upstream WebSocket connection.
- **Upstream → client:** `pump_up` reads from the upstream WebSocket and sends
  ASGI `websocket.send` events back to the client.

## Using WebSocket Through Your Tunnel

### 1. Start your local WebSocket server

```bash
# Example: Django Daphne
daphne -b 127.0.0.1 -p 8010 myproject.asgi:application

# Example: Node.js WebSocket server
node server.js  # listening on port 8010
```

### 2. Connect the IRAGT tunnel

```bash
ssh -p 2222 -R0:localhost:8010 db5f8bb0a9ffb2ea@ssh.iraglobaltech.com
```

The server will print your tunnel URL, e.g. `https://abc123.iraglobaltech.com`.
If you have a custom domain configured, it will also show that.

### 3. Connect your WebSocket client

```javascript
// Browser JavaScript
const ws = new WebSocket('wss://abc123.iraglobaltech.com/ws/chat/');

ws.onopen = () => {
    console.log('Connected!');
    ws.send(JSON.stringify({type: 'setup', sessionId: '123'}));
};

ws.onmessage = (event) => {
    console.log('Received:', event.data);
};

ws.onclose = (event) => {
    console.log('Closed:', event.code, event.reason);
};
```

```python
# Python (websockets library)
import asyncio
import websockets

async def connect():
    async with websockets.connect("wss://abc123.iraglobaltech.com/ws/chat/") as ws:
        await ws.send('{"type": "setup", "sessionId": "123"}')
        response = await ws.recv()
        print(f"Received: {response}")

asyncio.run(connect())
```

### 4. With a custom domain

If your token has a custom domain (e.g. `code.example.com`), use that instead:

```javascript
const ws = new WebSocket('wss://code.example.com/ws/audio/');
```

## Important: HTTP/2 and WebSocket

**WebSocket requires HTTP/1.1.** The `Upgrade: websocket` header is an
HTTP/1.1 mechanism (RFC 6455). HTTP/2 does NOT support this header — it
silently ignores it, causing the WebSocket upgrade to fail.

IRAGT's nginx configs are configured **without `http2`** on port 443 to
ensure WebSocket compatibility. If you manually edit nginx configs:

```nginx
# ✅ CORRECT — no http2, WebSocket works
listen 443 ssl;

# ❌ WRONG — http2 breaks WebSocket Upgrade
listen 443 ssl http2;
```

**Why?** In nginx, `http2` is a socket-level option. If ANY server block
on `0.0.0.0:443` has `http2`, ALPN will offer `h2` for ALL connections on
that port — even for server blocks that don't have `http2` themselves.

## Nginx Configuration for WebSocket

IRAGT's SSL manager generates nginx configs with a dedicated `/ws/` location
block for WebSocket routes:

```nginx
# WebSocket routes — long timeout, no buffering, HTTP/1.1
location /ws/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_connect_timeout 30s;
    proxy_read_timeout 3600s;    # 1 hour — sustained WS connections
    proxy_send_timeout 3600s;
    proxy_buffering off;         # Stream frames immediately
}

# Regular HTTP routes
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    # ... standard proxy headers ...
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
    proxy_buffering off;
}
```

Key settings for WebSocket:
- **`proxy_http_version 1.1`** — Required for Upgrade header
- **`proxy_set_header Upgrade $http_upgrade`** — Forward the Upgrade header
- **`proxy_set_header Connection "upgrade"`** — Keep the connection alive
- **`proxy_buffering off`** — Stream frames immediately (don't buffer)
- **`proxy_read_timeout 3600s`** — Long timeout for sustained connections
- **No `http2`** on the `listen` directive

## SSL Certificate for Custom Domains

For WebSocket to work with a custom domain, the SSL certificate must match
the domain name. IRAGT's SSL manager automatically issues Let's Encrypt
certs when you verify a custom domain.

To manually issue a cert:

```bash
certbot certonly --webroot -w /var/www/certbot -d code.example.com \
    --non-interactive --agree-tos -m admin@example.com
```

Then create or update the nginx config (see `ssl_manager.py` template).

## Troubleshooting

### WebSocket connection returns 403 Forbidden

This means the IRAGT proxy cannot find an active tunnel for the domain.
Check:
1. Is your SSH tunnel connected? (`ssh -p 2222 -R0:localhost:PORT token@ssh.iraglobaltech.com`)
2. Does your token have the correct custom domain configured?
3. After restarting the IRAGT service, tunnels take 20-30 seconds to reconnect.

### WebSocket upgrade returns 400 Bad Request

This usually means HTTP/2 is being used. Check:
1. `curl -sk --http1.1 --resolve "domain:443:SERVER_IP" -v "https://domain/ws/"` —
   if this returns 101, HTTP/2 is the problem.
2. Ensure NO nginx server block on port 443 has `http2` in the `listen` directive.

### WebSocket connects but no data flows

Check:
1. Is your local WebSocket server running on the correct port?
2. Does the path match? (e.g. `/ws/audio/` — include trailing slash if needed)
3. Check the IRAGT logs: `journalctl -u iragt -f | grep -i websocket`

### Connection drops after 10 seconds

The upstream WebSocket ping timeout may be too aggressive. The IRAGT proxy
disables upstream pings by default (`ping_interval=None`). If your local
service has its own ping mechanism, ensure the timeout is long enough.

### "InvalidUpgrade: invalid Upgrade header" error

This occurs when the upstream's response headers include duplicate `Upgrade`
or `Connection` headers. IRAGT filters hop-by-hop headers from the 101
response. If you're using a custom WebSocket server, ensure it doesn't send
duplicate Upgrade headers.

## Twilio ConversationRelay (AI Voice Calls)

Twilio ConversationRelay requires a persistent WebSocket connection to your
AI agent server. Example setup:

1. **Local service:** Django Daphne on port 8010 with a `/ws/audio/` endpoint
2. **IRAGT tunnel:** `ssh -p 2222 -R0:localhost:8010 token@ssh.iraglobaltech.com`
3. **Custom domain:** `code.example.com` (configured in dashboard)
4. **Twilio TwiML:** Set the WebSocket URL to `wss://code.example.com/ws/audio/`

```xml
<!-- TwiML voice template -->
<Response>
  <Connect>
    <ConversationRelay url="wss://code.example.com/ws/audio/"/>
  </Connect>
</Response>
```

The IRAGT proxy will:
- Accept the WebSocket upgrade (HTTP/1.1 101)
- Forward Twilio's "setup" message to your Daphne server
- Bidirectionally stream audio data frames
- Keep the connection alive for the duration of the call