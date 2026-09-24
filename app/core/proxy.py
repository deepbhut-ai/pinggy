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
    if request.client:
        if hasattr(request.client, "host"):
            return request.client.host
        if isinstance(request.client, (tuple, list)) and len(request.client) > 0:
            return str(request.client[0])
    return "0.0.0.0"


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

    # HTTPS / WSS check
    proto = str(request.headers.get("x-forwarded-proto") or "").lower()
    if sec.get("https_only") and scheme not in ("https", "wss") and proto not in ("https", "wss"):
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
         "abc123.iraglobaltech.com" → "abc123"
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

        # Check if the specific endpoint (or whole tunnel) is paused at runtime (v3.0.0)
        if tunnel.is_endpoint_paused(matched_addr) or tunnel.is_endpoint_paused(host):
            await increment_request_count(subdomain, 0)
            log_to_tunnel(subdomain, f"  [{datetime.now().strftime('%H:%M:%S')}] {request.method:<6s} {request.url.path or '/':<30s} → 503 (paused)")
            return Response(
                content="""<!DOCTYPE html>
<html>
<head><title>Endpoint Paused | IRAGT</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
  .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 32px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); margin-bottom: 16px; }
  h1 { font-size: 20px; font-weight: 700; margin: 0 0 10px 0; color: #ffffff; }
  p { font-size: 14px; color: #9ca3af; line-height: 1.5; margin: 0 0 20px 0; }
  .host { font-family: monospace; background: #1f2937; padding: 4px 8px; border-radius: 6px; color: #60a5fa; }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">⏸️ PAUSED</div>
    <h1>Endpoint is Currently Paused</h1>
    <p>Traffic forwarding for <span class="host">""" + (host or subdomain) + """</span> is paused from your IRAGT dashboard.</p>
    <p style="font-size: 12px; color: #6b7280; margin: 0;">Toggle this port back ON in your dashboard to resume instant traffic routing.</p>
  </div>
</body>
</html>""",
                status_code=503,
                media_type="text/html",
            )

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
                if key.lower() not in ("host", "transfer-encoding", "connection", "content-length"):
                    forward_headers[key] = value
            # Preserve incoming host and standard proxy headers so frameworks like Laravel/Django/React
            # can properly validate CSRF tokens, session cookies, origin URLs, and WebSockets.
            real_host = host or request.headers.get("host", f"localhost:{tunnel.local_port}")
            forward_headers["host"] = real_host
            forward_headers["x-forwarded-host"] = real_host
            
            # Determine actual incoming protocol (http vs https)
            proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
            forward_headers["x-forwarded-proto"] = proto
            forward_headers["x-forwarded-port"] = request.headers.get("x-forwarded-port") or ("443" if proto == "https" else "80")
            forward_headers["x-forwarded-for"] = _client_ip(request)
            forward_headers["x-real-ip"] = _client_ip(request)

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

            # Build response — exclude hop-by-hop headers.
            # CRITICAL: Set-Cookie headers must be preserved as separate entries.
            # Using a plain dict collapses multiple Set-Cookie headers into one
            # (joined by comma), which browsers cannot parse — the second cookie
            # is silently dropped. This breaks Laravel/Django apps that set
            # session + CSRF cookies (e.g. callingagents.in login → 419 Page
            # Expired).
            # Fix: build the Response with a starlette Headers object that
            # supports multiple values for the same key, then append each
            # Set-Cookie individually via set_cookie or raw header.
            from starlette.datastructures import Headers as StarletteHeaders

            # Start with a dict for all non-Set-Cookie headers
            resp_headers = {}
            set_cookie_values = []
            for key, value in resp.headers.multi_items():
                lk = key.lower()
                if lk in ("transfer-encoding", "connection", "content-encoding", "content-length"):
                    continue
                if lk == "set-cookie":
                    set_cookie_values.append(value)
                else:
                    resp_headers[key] = value

            # Build a dict copy for the debugger capture (it only needs a sample)
            debug_hdrs = dict(resp_headers)
            if set_cookie_values:
                debug_hdrs["set-cookie"] = set_cookie_values[0]

            # Web debugger capture (v0.11.0) — fire-and-forget
            await _debug_capture(subdomain, request.method, req_path, resp.status_code,
                                 forward_headers, debug_hdrs, resp.content)

            # Create the response with dict headers, then append each
            # Set-Cookie as a separate raw header so the browser sees them
            # as individual Set-Cookie entries.
            response = Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=resp_headers,
                media_type=resp.headers.get("content-type"),
            )
            for sc_value in set_cookie_values:
                response.raw_headers.append((b"set-cookie", sc_value.encode("latin-1")))

            return response

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
        if k.decode().lower() == "x-forwarded-host":
            host = v.decode().split(",")[0].strip().split(":")[0]
            break
    if not host:
        for k, v in reversed(scope.get("headers", [])):
            if k.decode().lower() == "host":
                cand = v.decode().split(":")[0]
                if cand and cand not in ("127.0.0.1", "localhost", "0.0.0.0"):
                    host = cand
                    break
                if not host:
                    host = cand
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

    if tunnel.is_endpoint_paused(host) or tunnel.is_endpoint_paused(subdomain):
        await send({"type": "websocket.close", "code": 1013})  # 1013: Try Again Later
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
        def __init__(self, h, client):
            self.headers = h
            self.client = client

    if sec:
        ws_scheme = "wss" if headers.get("x-forwarded-proto") == "https" or scope.get("scheme") == "wss" else "ws"
        denied = _check_security(_FakeReq(headers, scope.get("client")), sec, ws_scheme)
        if denied is not None:
            await send({"type": "websocket.close", "code": 1008})
            return

    try:
        # Extract subprotocols from client handshake if requested
        subprotocols = []
        raw_sub = headers.get("sec-websocket-protocol")
        if raw_sub:
            subprotocols = [s.strip() for s in raw_sub.split(",") if s.strip()]

        _ws_exclude = {
            "host", "connection", "upgrade", "sec-websocket-key",
            "sec-websocket-version", "sec-websocket-extensions",
            "sec-websocket-protocol", "sec-websocket-accept",
        }
        fwd_headers = {k: v for k, v in headers.items() if k.lower() not in _ws_exclude}

        async with websockets.connect(
            uri,
            additional_headers=fwd_headers,
            subprotocols=subprotocols or None,
            max_size=10 * 1024 * 1024,
            ping_interval=None,
            ping_timeout=None,
            close_timeout=10,
        ) as upstream:
            # Accept the client handshake — forward upstream response headers
            # (especially Set-Cookie) as a list of (bytes, bytes) tuples so
            # multiple Set-Cookie headers are preserved individually.
            # websockets v17 exposes the handshake response via .response.headers
            # (NOT .response_headers, which doesn't exist in v17+).
            # Filter out hop-by-hop headers (Upgrade, Connection, etc.) — uvicorn
            # sets its own when sending the 101 to the client. Forwarding the
            # upstream's duplicates causes "invalid Upgrade header" errors.
            _ws_hop_by_hop = {"upgrade", "connection", "sec-websocket-accept",
                              "sec-websocket-key", "sec-websocket-version",
                              "sec-websocket-extensions", "sec-websocket-protocol",
                              "transfer-encoding", "content-length", "date", "server"}
            ws_resp_headers = []
            rh = getattr(upstream, "response", None)
            if rh is not None:
                hdrs = getattr(rh, "headers", None)
                if hdrs is not None:
                    if hasattr(hdrs, "multi_items"):
                        for k, v in hdrs.multi_items():
                            if k.lower() not in _ws_hop_by_hop:
                                ws_resp_headers.append((k.encode(), v.encode()))
                    else:
                        for k, v in hdrs.items():
                            if k.lower() not in _ws_hop_by_hop:
                                ws_resp_headers.append((k.encode(), v.encode()))

            accept_payload = {"type": "websocket.accept"}
            if getattr(upstream, "subprotocol", None):
                accept_payload["subprotocol"] = str(upstream.subprotocol)
            if ws_resp_headers:
                accept_payload["headers"] = ws_resp_headers
            await send(accept_payload)

            client_done = False
            upstream_done = False

            async def pump_up():
                nonlocal client_done
                try:
                    while True:
                        msg = await upstream.recv()
                        if isinstance(msg, str):
                            await send({"type": "websocket.send", "text": msg})
                        else:
                            await send({"type": "websocket.send", "bytes": msg})
                except Exception as e:
                    logger.debug("WS pump_up ended for %s: %s", subdomain, e)
                finally:
                    client_done = True

            async def pump_down():
                nonlocal client_done
                try:
                    while True:
                        ev = await receive()
                        if ev["type"] == "websocket.disconnect":
                            break
                        if ev["type"] == "websocket.receive":
                            if ev.get("text") is not None:
                                await upstream.send(ev["text"])
                            elif ev.get("bytes") is not None:
                                await upstream.send(ev["bytes"])
                except Exception as e:
                    logger.debug("WS pump_down ended for %s: %s", subdomain, e)
                finally:
                    client_done = True

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
        logger.exception("WS tunnel error %s: %s", subdomain, e)
        try:
            await send({"type": "websocket.close", "code": 1011})
        except Exception:
            pass
