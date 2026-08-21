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
    through the SSH reverse tunnel."""

    async def dispatch(self, request: Request, call_next):
        host = request.headers.get("host", "")
        subdomain = _extract_subdomain(host)

        # If no subdomain, pass through to normal FastAPI routes
        if not subdomain:
            return await call_next(request)

        # Check if this is a custom domain (CNAME pointing to a tunnel)
        # If the subdomain contains a dot, it's likely a custom domain
        if "." in subdomain and not subdomain.endswith(f".{settings.TUNNEL_DOMAIN}"):
            # Look up the custom domain in the database
            # to find which tunnel subdomain it points to
            import hashlib
            import psycopg
            from app.core.config import settings as cfg
            try:
                conn = psycopg.connect(cfg.async_dsn, autocommit=True)

                # First check tokens table (new multi-token system)
                cur = conn.execute(
                    "SELECT token FROM tokens WHERE custom_domain = %s",
                    (subdomain,),
                )
                row = cur.fetchone()
                cur.close()

                if row:
                    # Found in tokens table — subdomain from token
                    subdomain = hashlib.md5(row[0].encode()).hexdigest()[:7]
                else:
                    # Fallback: check users table (legacy single-token system)
                    cur = conn.execute(
                        "SELECT tunnel_token FROM users WHERE custom_domain = %s",
                        (subdomain,),
                    )
                    row = cur.fetchone()
                    cur.close()

                    if row:
                        # Found in users table — subdomain from token
                        subdomain = hashlib.md5(row[0].encode()).hexdigest()[:7]
                    else:
                        # Also try by email (old MD5(email) subdomain format)
                        cur = conn.execute(
                            "SELECT email FROM users WHERE custom_domain = %s",
                            (subdomain,),
                        )
                        email_row = cur.fetchone()
                        cur.close()
                        if email_row:
                            subdomain = hashlib.md5(email_row[0].encode()).hexdigest()[:7]

                conn.close()
            except Exception:
                pass

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