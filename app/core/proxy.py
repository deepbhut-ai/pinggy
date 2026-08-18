"""HTTP proxy — routes subdomain requests to SSH tunnel ports.

When a browser visits abc123.localhost:8080, this proxy:
1. Extracts the subdomain from the Host header
2. Looks up the tunnel in the registry
3. Forwards the request to localhost:<remote_port> (the SSH reverse tunnel)
4. Returns the response to the browser
"""
import logging

import httpx
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.tunnel_registry import get_tunnel, increment_request_count

logger = logging.getLogger("proxy")


def _extract_subdomain(host: str) -> str | None:
    """Extract the tunnel subdomain from a Host header.

    e.g. "abc123.localhost:8080" → "abc123"
         "abc123.pinggy.example.com" → "abc123"
         "custom.example.com" → checks DB for custom domain
    """
    # Strip port
    if ":" in host:
        host = host.split(":")[0]
    # Strip the base domain
    base = settings.TUNNEL_DOMAIN
    if host == base or host == "localhost" or host == "127.0.0.1":
        return None  # No subdomain — not a tunnel request
    if host.endswith(f".{base}"):
        sub = host[: -len(f".{base}")]
        if sub and "." not in sub:
            return sub
    # Also handle .localhost for dev
    if host.endswith(".localhost"):
        sub = host[: -len(".localhost")]
        if sub and "." not in sub:
            return sub
    # If not a subdomain of our base domain, it might be a custom domain
    # Return the full host — the middleware will check the DB for custom domains
    return host  # Could be a custom domain — let the middleware decide


# Cache for custom domain → subdomain mapping (refreshed every 60 seconds)
_custom_domain_cache: dict[str, str] = {}
_custom_domain_cache_time: float = 0

async def _resolve_custom_domain(host: str) -> str | None:
    """Check if host is a custom domain and return the user's subdomain."""
    global _custom_domain_cache, _custom_domain_cache_time
    import time

    # Refresh cache every 60 seconds
    now = time.time()
    if now - _custom_domain_cache_time > 60:
        try:
            from app.core.db import get_conn
            async with get_conn() as db:
                cur = await db.execute(
                    "SELECT custom_domain, email FROM users WHERE custom_domain IS NOT NULL"
                )
                rows = await cur.fetchall()
                await cur.close()
                import hashlib
                _custom_domain_cache = {
                    r[0]: hashlib.md5(r[1].encode()).hexdigest()[:7]
                    for r in rows
                }
                _custom_domain_cache_time = now
        except Exception:
            pass

    return _custom_domain_cache.get(host)


class TunnelProxyMiddleware(BaseHTTPMiddleware):
    """Middleware that intercepts subdomain requests and proxies them
    through the SSH reverse tunnel."""

    async def dispatch(self, request: Request, call_next):
        host = request.headers.get("host", "")
        # Strip port
        raw_host = host.split(":")[0] if ":" in host else host
        base = settings.TUNNEL_DOMAIN

        # If it's the base domain or localhost, pass through to FastAPI routes
        if raw_host == base or raw_host == "localhost" or raw_host == "127.0.0.1":
            return await call_next(request)

        subdomain = _extract_subdomain(host)

        # If subdomain is the same as raw_host, it might be a custom domain
        if subdomain == raw_host:
            # Check if it's a custom domain
            resolved = await _resolve_custom_domain(raw_host)
            if resolved:
                subdomain = resolved
            else:
                # Not a custom domain and not a subdomain — pass through
                return await call_next(request)

        if not subdomain:
            return await call_next(request)

        # Look up the tunnel
        tunnel = await get_tunnel(subdomain)
        if not tunnel:
            return Response(
                content=f"<h1>No tunnel found for subdomain: {subdomain}</h1>"
                f"<p>This tunnel may have been disconnected.</p>",
                status_code=502,
                media_type="text/html",
            )

        # Forward the request through the SSH reverse tunnel
        # The SSH -R0:localhost:PORT creates a listener on the server at
        # tunnel.remote_port. We forward to localhost:remote_port.
        target_url = f"http://127.0.0.1:{tunnel.remote_port}{request.url.path}"
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

            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
                resp = await client.request(
                    method=request.method,
                    url=target_url,
                    headers=forward_headers,
                    content=body if body else None,
                    follow_redirects=False,
                )

            # Track stats
            await increment_request_count(subdomain, len(resp.content))

            # Build response — exclude hop-by-hop headers
            resp_headers = {}
            for key, value in resp.headers.items():
                if key.lower() not in ("transfer-encoding", "connection", "content-encoding", "content-length"):
                    resp_headers[key] = value

            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=resp_headers,
                media_type=resp.headers.get("content-type"),
            )

        except httpx.ConnectError:
            return Response(
                content="<h1>Tunnel connection refused</h1>"
                "<p>The local service may not be running. "
                "Make sure your dev server is running on the port you specified.</p>",
                status_code=502,
                media_type="text/html",
            )
        except httpx.ReadTimeout:
            return Response(
                content="<h1>Tunnel request timed out</h1>",
                status_code=504,
                media_type="text/html",
            )
        except Exception as e:
            logger.error("Proxy error for %s: %s", subdomain, e)
            return Response(
                content=f"<h1>Proxy error</h1><p>{e}</p>",
                status_code=502,
                media_type="text/html",
            )