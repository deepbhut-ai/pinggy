"""HTTP proxy — routes subdomain requests to SSH tunnel ports.

When a browser visits abc123.localhost:8080, this proxy:
1. Extracts the subdomain from the Host header
2. Looks up the tunnel in the registry
3. Forwards the request to localhost:<remote_port> (the SSH reverse tunnel)
4. Returns the response to the browser
"""
import logging
import time
from datetime import datetime

import httpx
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.tunnel_registry import (
    get_tunnel,
    get_tunnel_by_custom_domain,
    increment_request_count,
    log_to_tunnel,
)

logger = logging.getLogger("proxy")


# ---- Web debugger capture (v0.11.0) — Redis ring buffer per subdomain ----
DEBUG_CAPTURE = True   # capture toggle (low overhead: single rpush+ltrim per request)
DEBUG_MAX = 100        # entries kept per tunnel


async def _debug_capture(subdomain: str, method: str, path: str, status_code: int,
                          req_headers: dict, resp_headers: dict, body_preview: bytes) -> None:
    """Best-effort capture of a request/response pair for the debugger viewer."""
    if not DEBUG_CAPTURE:
        return
    try:
        from app.core.redis import get_redis
        import json as _json
        import time as _time
        r = get_redis()
        if r is None:
            return
        entry = {
            "ts": _time.time(),
            "method": method,
            "path": path,
            "status": status_code,
            "req_headers": {k: v for k, v in list(req_headers.items())[:20]},
            "resp_headers": {k: v for k, v in list(resp_headers.items())[:20]},
            "body": body_preview[:2048].decode("utf-8", "replace"),
        }
        key = f"dbg:{subdomain}"
        await r.rpush(key, _json.dumps(entry))
        await r.ltrim(key, -DEBUG_MAX, -1)
        await r.expire(key, 3600)
    except Exception as e:
        logger.debug("debug capture failed: %s", e)


async def _get_token_security(tunnel) -> dict | None:
    """Load the tunnel's token security settings from the DB (best-effort).
    Returns None when nothing is configured (zero overhead default path)."""
    token = getattr(tunnel, "token", None) if tunnel else None
    if not token:
        return None
    try:
        import psycopg
        from app.core.config import settings
        def _q():
            with psycopg.connect(settings.async_dsn, autocommit=True) as conn:
                cur = conn.execute(
                    "SELECT basic_auth_user, basic_auth_pass, ip_whitelist, bearer_key, https_only "
                    "FROM tokens WHERE token = %s",
                    (token,),
                )
                row = cur.fetchone()
                cur.close()
                return row
        import asyncio
        row = await asyncio.to_thread(_q)
        if not row:
            return None
        return {
            "basic_user": row[0], "basic_pass": row[1],
            "ip_whitelist": row[2], "bearer_key": row[3], "https_only": row[4],
        }
    except Exception as e:
        logger.debug("token security lookup failed: %s", e)
        return None


def _client_ip(request: Request) -> str:
    for h in ("CF-Connecting-IP", "X-Real-IP"):
        v = request.headers.get(h)
        if v:
            return v.strip()
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


def _ip_allowed(client_ip: str, whitelist: str) -> bool:
    """Comma-separated entries: exact IPs or CIDR ranges."""
    import ipaddress
    try:
        cip = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    for entry in (whitelist or "").split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            if "/" in entry:
                if cip in ipaddress.ip_network(entry, strict=False):
                    return True
            elif cip == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


def _check_security(request: Request, sec: dict, scheme: str):
    """Returns a Response when the request must be denied, else None."""
    import base64
    import hmac as _hmac

    # HTTPS-only
    if sec.get("https_only") and scheme != "https" and request.headers.get("x-forwarded-proto") != "https":
        return Response(
            content="<h1>403 — HTTPS required</h1><p>This tunnel only accepts HTTPS requests.</p>",
            status_code=403, media_type="text/html",
        )

    # IP whitelist
    wl = sec.get("ip_whitelist")
    if wl and wl.strip():
        if not _ip_allowed(_client_ip(request), wl):
            return Response(
                content="<h1>403 — IP not allowed</h1><p>Your IP is not on this tunnel's whitelist.</p>",
                status_code=403, media_type="text/html",
            )

    # Bearer-key auth
    bk = sec.get("bearer_key")
    if bk:
        provided = request.headers.get("x-api-key") or ""
        auth = request.headers.get("authorization") or ""
        token_val = auth[7:] if auth.lower().startswith("bearer ") else provided
        if not token_val or not _hmac.compare_digest(str(bk), token_val):
            return Response(
                content="<h1>401 — API key required</h1><p>Send header: X-Api-Key: &lt;key&gt;</p>",
                status_code=401, media_type="text/html",
            )

    # Basic auth
    bu, bp = sec.get("basic_user"), sec.get("basic_pass")
    if bu and bp:
        auth = request.headers.get("authorization") or ""
        ok = False
        if auth.lower().startswith("basic "):
            try:
                decoded = base64.b64decode(auth[6:]).decode()
                u, _, p = decoded.partition(":")
                ok = _hmac.compare_digest(u, bu) and _hmac.compare_digest(p, bp)
            except Exception:
                ok = False
        if not ok:
            return Response(
                content="<h1>401 — Authentication required</h1>",
                status_code=401,
                headers={"WWW-Authenticate": 'Basic realm="Tunnel"'},
                media_type="text/html",
            )
    return None


def _extract_subdomain(host: str) -> str | None:
    """Extract the tunnel subdomain from a Host header.

    e.g. "abc123.localhost:8080" → "abc123"
         "abc123.pinggy.example.com" → "abc123"
    """
    # Strip port
    if ":" in host:
        host = host.split(":")[0]
    # Strip the base domain
    base = settings.TUNNEL_DOMAIN
    if host == base or host == "localhost" or host == "127.0.0.1":
        return None  # No subdomain — not a tunnel request
    # Skip raw IP addresses (server IP, admin access via IP)
    import re
    if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", host):
        return None
    if host.endswith(f".{base}"):
        sub = host[: -len(f".{base}")]
        if sub and "." not in sub:
            return sub
    # Also handle .localhost for dev
    if host.endswith(".localhost"):
        sub = host[: -len(".localhost")]
        if sub and "." not in sub:
            return sub
    # Custom domain — return the full host so the middleware can look it up
    return host


class TunnelProxyMiddleware(BaseHTTPMiddleware):
    """Middleware that intercepts subdomain requests and proxies them
    through the SSH reverse tunnel.

    v1.10.0: WebSocket upgrades are handled BEFORE this middleware by
    tunnel_websocket() (ASGI-level route) — BaseHTTPMiddleware cannot
    pass through connection upgrades."""

    async def dispatch(self, request: Request, call_next):
        host = request.headers.get("host", "")
        subdomain = _extract_subdomain(host)

        # Health checks must reach FastAPI even when the host has no live tunnel.
        if request.url.path == "/health":
            return await call_next(request)

        # If no subdomain, pass through to normal FastAPI routes
        if not subdomain:
            return await call_next(request)

        # Look up generated tunnel subdomains first, then custom domains.
        # SSH assigns a random subdomain, so it cannot be derived from the token.
        tunnel = await get_tunnel(subdomain)
        matched_addr = subdomain  # v1.9.0: which address the request came in on
        if not tunnel:
            tunnel = await get_tunnel_by_custom_domain(host)
            if tunnel:
                subdomain = tunnel.subdomain
                matched_addr = host.strip().lower().split(":")[0]
        if not tunnel:
            return Response(
                content=f"<h1>No tunnel found for subdomain: {subdomain}</h1>"
                f"<p>This tunnel may have been disconnected.</p>",
                status_code=502,
                media_type="text/html",
            )

        # ---- Token-level security options (v0.8.0) — all OFF by default ----
        sec = await _get_token_security(tunnel)
        if sec:
            denied = _check_security(request, sec, request.url.scheme)
            if denied is not None:
                # count blocked requests too
                await increment_request_count(subdomain, 0)
                log_to_tunnel(subdomain, f"  [{datetime.now().strftime('%H:%M:%S')}] {request.method:<6s} {request.url.path or '/':<30s} → {denied.status_code}  (blocked: security)")
                return denied

        # Forward the request through the SSH reverse tunnel
        # The SSH -R0:localhost:PORT creates a listener on the server at
        # tunnel.remote_port. We forward to localhost:remote_port.
        # v1.9.0 multi-port: each address can have its own remote port.
        target_port = tunnel.endpoint_port(matched_addr)
        target_url = f"http://127.0.0.1:{target_port}{request.url.path}"
        if request.url.query:
            target_url += f"?{request.url.query}"

        try:
            # Read request body
            body = await request.body()

            # Build headers to forward (exclude hop-by-hop headers)
            forward_headers = {}
            for key, value in request.headers.items():
                if key.lower() not in ("host", "transfer-encoding", "connection"):
                    forward_headers[key] = value
            # Set the host to the tunnel's local host
            forward_headers["host"] = f"localhost:{tunnel.local_port}"

            # Track request timing for live log
            req_start = time.monotonic()
            req_path = request.url.path or "/"
            if request.url.query:
                req_path += f"?{request.url.query}"

            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
                resp = await client.request(
                    method=request.method,
                    url=target_url,
                    headers=forward_headers,
                    content=body if body else None,
                    follow_redirects=False,
                )

            # Track stats — per-direction (v1.2.0): received = request bytes in,
            # sent = response bytes out; total keeps bytes_transferred meaning.
            req_len = len(body) if body else 0
            resp_len = len(resp.content)
            await increment_request_count(subdomain, req_len + resp_len, sent=resp_len, received=req_len)

            # Log to user's SSH terminal
            elapsed_ms = int((time.monotonic() - req_start) * 1000)
            timestamp = datetime.now().strftime("%H:%M:%S")
            status = resp.status_code
            log_to_tunnel(subdomain, f"  [{timestamp}] {request.method:<6s} {req_path:<30s} → {status}  ({elapsed_ms}ms)")

            # Build response — exclude hop-by-hop headers
            resp_headers = {}
            for key, value in resp.headers.items():
                if key.lower() not in ("transfer-encoding", "connection", "content-encoding", "content-length"):
                    resp_headers[key] = value

            # Web debugger capture (v0.11.0) — fire-and-forget
            await _debug_capture(subdomain, request.method, req_path, resp.status_code,
                                 forward_headers, resp_headers, resp.content)

            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=resp_headers,
                media_type=resp.headers.get("content-type"),
            )

        except httpx.ConnectError:
            timestamp = datetime.now().strftime("%H:%M:%S")
            log_to_tunnel(subdomain, f"  [{timestamp}] {request.method:<6s} {request.url.path or '/':<30s} → 502 (refused)")
            return Response(
                content="<h1>Tunnel connection refused</h1>"
                "<p>The local service may not be running. "
                "Make sure your dev server is running on the port you specified.</p>",
                status_code=502,
                media_type="text/html",
            )
        except httpx.ReadTimeout:
            timestamp = datetime.now().strftime("%H:%M:%S")
            log_to_tunnel(subdomain, f"  [{timestamp}] {request.method:<6s} {request.url.path or '/':<30s} → 504 (timeout)")
            return Response(
                content="<h1>Tunnel request timed out</h1>",
                status_code=504,
                media_type="text/html",
            )
        except Exception as e:
            timestamp = datetime.now().strftime("%H:%M:%S")
            log_to_tunnel(subdomain, f"  [{timestamp}] {request.method:<6s} {request.url.path or '/':<30s} → ERR ({e})")
            logger.error("Proxy error for %s: %s", subdomain, e)
            return Response(
                content=f"<h1>Proxy error</h1><p>{e}</p>",
                status_code=502,
                media_type="text/html",
            )

# ---- WebSocket pass-through (v1.10.0) ----
async def tunnel_websocket(scope, receive, send, rest: str = ""):
    """ASGI WebSocket endpoint: bridges the client WS to the tunnel's local
    service via the SSH-forwarded remote port (raw TCP relay). Mounted in
    main.py BEFORE middleware so upgrades aren't swallowed."""
    import websockets

    if scope["type"] != "websocket":
        return  # not for us

    host = ""
    for k, v in scope.get("headers", []):
        if k.decode().lower() == "host":
            host = v.decode().split(":")[0]
            break
    subdomain = _extract_subdomain(host)
    if not subdomain:
        await send({"type": "websocket.close", "code": 1008})
        return

    tunnel = await get_tunnel(subdomain)
    if not tunnel:
        tunnel = await get_tunnel_by_custom_domain(host)
    if not tunnel:
        await send({"type": "websocket.close", "code": 1014})
        return

    target_port = tunnel.endpoint_port(host)
    path = scope.get("path", "/")
    qs = scope.get("query_string", b"").decode()
    uri = f"ws://127.0.0.1:{target_port}{path}"
    if qs:
        uri += f"?{qs}"

    # security check mirrors HTTP path (v0.8.0)
    sec = await _get_token_security(tunnel)
    headers = {k.decode(): v.decode() for k, v in scope.get("headers", [])}

    class _FakeReq:
        def __init__(self, h):
            self.headers = h
    if sec:
        denied = _check_security(_FakeReq(headers), sec, "ws")
        if denied is not None:
            await send({"type": "websocket.close", "code": 1008})
            return

    try:
        async with websockets.connect(
            uri,
            additional_headers={k: v for k, v in headers.items()
                                 if k.lower() not in ("host", "connection", "upgrade", "sec-websocket-key",
                                                      "sec-websocket-version", "sec-websocket-extensions")},
            max_size=10 * 1024 * 1024,
            ping_interval=20,
            ping_timeout=20,
            close_timeout=5,
        ) as upstream:
            # accept the client handshake
            await send({"type": "websocket.accept"})

            client_done = False
            upstream_done = False

            async def pump_up():
                nonlocal client_done
                while True:
                    msg = await upstream.recv()
                    if isinstance(msg, str):
                        await send({"type": "websocket.send", "text": msg})
                    else:
                        await send({"type": "websocket.send", "bytes": msg})

            async def pump_down():
                nonlocal client_done
                while True:
                    ev = await receive()
                    if ev["type"] == "websocket.disconnect":
                        break
                    if ev["type"] == "websocket.receive":
                        if ev.get("text") is not None:
                            await upstream.send(ev["text"])
                        elif ev.get("bytes") is not None:
                            await upstream.send(ev["bytes"])

            import asyncio as _aio
            up = _aio.create_task(pump_up())
            down = _aio.create_task(pump_down())
            try:
                done, pending = await _aio.wait(
                    {up, down}, return_when=_aio.FIRST_COMPLETED,
                )
            except Exception:
                pass
            finally:
                for t in (up, down):
                    t.cancel()
            try:
                await send({"type": "websocket.close", "code": 1000})
            except Exception:
                pass
            await increment_request_count(subdomain, 64)
            log_to_tunnel(subdomain, f"  [{datetime.now().strftime('%H:%M:%S')}] WS     {path}  closed")
    except Exception as e:
        logger.info("WS tunnel error %s: %s", subdomain, e)
        try:
            await send({"type": "websocket.close", "code": 1011})
        except Exception:
            pass
