"""IP monitoring middleware — tracks every request in Redis.

Sits before TunnelProxyMiddleware so it sees ALL requests (tunnel + API).
For each request:
  1. Extracts the real client IP (from CF-Connecting-IP, X-Real-IP, or client)
  2. Checks if IP is blocked → returns 429 immediately
  3. Records the request in Redis (count, path, subdomain, user-agent)
  4. Does geo lookup on first sighting (async, non-blocking)
"""
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.core.redis import (
    get_redis,
    is_blocked,
    lookup_geo,
    record_request,
    store_geo,
)

logger = logging.getLogger("ip_monitor")


def _get_client_ip(request: Request) -> str:
    """Extract the real client IP, respecting Cloudflare and nginx headers."""
    # Cloudflare
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()
    # nginx real_ip
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    # X-Forwarded-For (first IP)
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    # Fallback
    return request.client.host if request.client else "0.0.0.0"


def _extract_subdomain_from_host(host: str) -> str:
    """Extract subdomain from Host header (same logic as proxy.py)."""
    if ":" in host:
        host = host.split(":")[0]
    base = settings.TUNNEL_DOMAIN
    if host == base or host == "localhost" or host == "127.0.0.1":
        return ""
    import re
    if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", host):
        return ""
    if host.endswith(f".{base}"):
        sub = host[: -len(f".{base}")]
        if sub and "." not in sub:
            return sub
    if host.endswith(".localhost"):
        sub = host[: -len(".localhost")]
        if sub and "." not in sub:
            return sub
    return host  # custom domain


class IPMonitorMiddleware(BaseHTTPMiddleware):
    """Middleware that tracks every request by IP in Redis."""

    async def dispatch(self, request: Request, call_next):
        # Skip health checks and static assets
        path = request.url.path
        if path in ("/health", "/favicon.ico") or path.startswith("/docs") or path.startswith("/redoc"):
            return await call_next(request)

        # Skip if Redis is not connected
        r = get_redis()
        if r is None:
            return await call_next(request)

        client_ip = _get_client_ip(request)
        host = request.headers.get("host", "")
        subdomain = _extract_subdomain_from_host(host)
        user_agent = request.headers.get("user-agent", "")

        # Check blocklist — reject immediately
        if await is_blocked(client_ip):
            return JSONResponse(
                status_code=429,
                content={"detail": "Your IP has been temporarily blocked due to suspicious activity."},
            )

        # Record the request in Redis (non-blocking — don't fail the request)
        try:
            await record_request(
                ip=client_ip,
                subdomain=subdomain,
                method=request.method,
                path=path,
                user_agent=user_agent,
            )

            # Geo lookup on first sighting (if country not yet stored)
            ip_key = f"ip:{client_ip}"
            has_geo = await r.hexists(ip_key, "country")
            if not has_geo and settings.IP_GEO_ENABLED:
                # Don't block the request — fire and forget
                import asyncio
                asyncio.create_task(self._do_geo_lookup(client_ip))
        except Exception as e:
            logger.debug("IP monitor error: %s", e)

        # Continue to the next middleware / route
        return await call_next(request)

    async def _do_geo_lookup(self, ip: str) -> None:
        """Look up geo info and store it in Redis (async background task)."""
        try:
            geo = await lookup_geo(ip)
            if geo:
                await store_geo(ip, geo)
        except Exception as e:
            logger.debug("Geo lookup task error: %s", e)