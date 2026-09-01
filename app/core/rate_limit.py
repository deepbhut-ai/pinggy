"""Rate limiting + DDoS shield (v1.10.0).

Redis sliding-window limiter with three zones:
  1. API zone      — /api/v1/* per IP           (default 60 req / min)
  2. AUTH zone     — /api/v1/auth/login|register|forgot|verify-otp per IP
                      (default 10 req / min, lockout escalation)
  3. TUNNEL zone   — proxied tunnel requests per IP AND per subdomain
                      (default 240 req / min per IP, 600 per subdomain total)

When a limit is exceeded the request is rejected with 429 + Retry-After.
Repeat offenders escalate: 3 strikes within 10 min → auto-ban via the
existing ip blocklist (fail2ban-style, honored by IPMonitorMiddleware).

All limits are overridable via app_settings keys (rl_<zone>_limit / rl_<zone>_window).
"""
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.redis import get_redis

logger = logging.getLogger("rate_limit")

# zone -> (limit, window_seconds)
DEFAULTS = {
    "api": (60, 60),
    "auth": (10, 60),
    "tunnel_ip": (240, 60),
    "tunnel_sub": (600, 60),
}
BAN_THRESHOLD = 3        # strikes before auto-ban
STRIKE_WINDOW = 600      # strikes counted within 10 min
BAN_SECONDS = 3600       # 1h ban on escalation

AUTH_PATHS = ("/auth/login", "/auth/register", "/auth/forgot-password",
              "/auth/verify-otp", "/auth/reset-password")


def _client_ip(request: Request) -> str:
    cf = request.headers.get("CF-Connecting-IP")
    if cf:
        return cf.strip()
    real = request.headers.get("X-Real-IP")
    if real:
        return real.strip()
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


def _zone_for(path: str, is_tunnel: bool) -> tuple[str, tuple[int, int]]:
    if is_tunnel:
        return "tunnel_ip", DEFAULTS["tunnel_ip"]
    if any(path.startswith(f"/api/v1{p}") for p in AUTH_PATHS):
        return "auth", DEFAULTS["auth"]
    if path.startswith("/api/v1"):
        return "api", DEFAULTS["api"]
    return "", (0, 0)  # static pages: unlimited


async def _sliding_hit(r, key: str, limit: int, window: int) -> tuple[bool, int]:
    """Redis ZSET sliding window. Returns (allowed, retry_after_s)."""
    now = time.time()
    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, now - window)
    pipe.zadd(key, {f"{now}:{id(pipe)}": now})
    pipe.zcard(key)
    pipe.expire(key, window + 5)
    res = await pipe.execute()
    count = res[2]
    if count > limit:
        # how long until the oldest hit falls out of the window
        oldest = await r.zrange(key, 0, 0, withscores=True)
        retry = max(1, int(window - (now - oldest[0][1]))) if oldest else window
        return False, retry
    return True, 0


async def _strike(r, ip: str) -> bool:
    """Record an abuse strike; return True if the IP should be auto-banned."""
    key = f"rl:strikes:{ip}"
    n = await r.incr(key)
    await r.expire(key, STRIKE_WINDOW)
    return n >= BAN_THRESHOLD


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Outermost shield: per-zone Redis sliding-window limits + auto-ban."""

    async def dispatch(self, request: Request, call_next):
        r = get_redis()
        if r is None:
            return await call_next(request)

        path = request.url.path
        if path in ("/health",) or path.startswith(("/docs", "/redoc", "/favicon")):
            return await call_next(request)

        host = (request.headers.get("host", "") or "").split(":")[0]
        is_tunnel = self._is_tunnel_host(host, path)
        zone, (limit, window) = _zone_for(path, is_tunnel)
        if not zone:
            return await call_next(request)

        ip = _client_ip(request)

        # auth zone: hard per-IP lockout (brute force)
        if zone == "auth":
            allowed, retry = await _sliding_hit(r, f"rl:auth:{ip}", limit, window)
            if not allowed:
                if await _strike(r, ip):
                    from app.core.redis import block_ip
                    await block_ip(ip, reason="auth brute-force", duration=BAN_SECONDS)
                    logger.warning("AUTO-BAN (auth brute-force): %s", ip)
                return JSONResponse(
                    status_code=429,
                    content={"detail": f"Too many attempts. Retry in {retry}s."},
                    headers={"Retry-After": str(retry)},
                )
            return await call_next(request)

        if zone == "tunnel_ip":
            per_ip_ok, retry = await _sliding_hit(r, f"rl:tip:{ip}", limit, window)
            sub = host  # per-subdomain total (all visitors combined)
            per_sub_ok, retry2 = await _sliding_hit(r, f"rl:tsub:{sub}", *DEFAULTS["tunnel_sub"])
            if not per_ip_ok or not per_sub_ok:
                if not per_ip_ok and await _strike(r, ip):
                    from app.core.redis import block_ip
                    await block_ip(ip, reason="tunnel flood", duration=BAN_SECONDS)
                    logger.warning("AUTO-BAN (tunnel flood): %s", ip)
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded for this tunnel."},
                    headers={"Retry-After": str(max(retry, retry2))},
                )
            return await call_next(request)

        # api zone
        allowed, retry = await _sliding_hit(r, f"rl:api:{ip}", limit, window)
        if not allowed:
            if await _strike(r, ip):
                from app.core.redis import block_ip
                await block_ip(ip, reason="api abuse", duration=BAN_SECONDS)
                logger.warning("AUTO-BAN (api abuse): %s", ip)
            return JSONResponse(
                status_code=429,
                content={"detail": f"API rate limit exceeded. Retry in {retry}s."},
                headers={"Retry-After": str(retry)},
            )
        return await call_next(request)

    @staticmethod
    def _is_tunnel_host(host: str, path: str) -> bool:
        from app.core.config import settings
        base = settings.TUNNEL_DOMAIN
        if not host or host in (base, "localhost", "127.0.0.1"):
            return False
        if path.startswith("/api/") or path.startswith(("/admin", "/dashboard", "/login", "/docs", "/redoc", "/static")):
            return False
        # *.tunnel-domain (single label) or any custom-domain-shaped host
        import re
        if host.endswith(f".{base}") and "." not in host[: -len(f".{base}")]:
            return True
        if host.endswith(".localhost") and "." not in host[: -len(".localhost")]:
            return True
        if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", host):
            return False
        # host that is not the app domain → treated as tunnel (custom domain)
        return host != base

    @staticmethod
    async def current_usage(ip: str) -> dict:
        """Introspection helper for the admin panel."""
        r = get_redis()
        if r is None:
            return {}
        out = {}
        for zone in ("api", "auth", "tip"):
            k = f"rl:{zone}:{ip}"
            out[zone] = await r.zcard(k)
        return out
