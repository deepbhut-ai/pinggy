"""Redis connection + helpers for IP monitoring and caching."""
import json
import logging
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger("redis")

_pool: aioredis.Redis | None = None


async def init_redis() -> None:
    """Create the Redis connection. Call on app startup."""
    global _pool
    if _pool is not None:
        return
    if not settings.REDIS_ENABLED:
        logger.info("Redis disabled — skipping connection.")
        return
    try:
        _pool = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        await _pool.ping()
        logger.info("Redis connected: %s", settings.REDIS_URL)
    except Exception as e:
        logger.warning("Redis connection failed: %s — IP monitoring disabled.", e)
        _pool = None


async def close_redis() -> None:
    """Close the Redis connection. Call on app shutdown."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
        logger.info("Redis connection closed.")


def get_redis() -> aioredis.Redis | None:
    """Return the Redis pool, or None if not connected."""
    return _pool


def redis_available() -> bool:
    return _pool is not None


# ---- IP monitoring helpers ----

def _ip_key(ip: str) -> str:
    return f"ip:{ip}"


async def record_request(
    ip: str,
    subdomain: str = "",
    method: str = "",
    path: str = "",
    status_code: int = 200,
    user_agent: str = "",
) -> dict[str, Any] | None:
    """Record a request from an IP in Redis. Returns IP info dict or None."""
    r = get_redis()
    if r is None:
        return None

    now = datetime.now(timezone.utc)
    now_ts = now.timestamp()
    now_iso = now.isoformat()
    key = _ip_key(ip)

    try:
        # Increment total request count
        await r.hincrby(key, "total_requests", 1)
        await r.hset(key, mapping={"last_seen": now_iso, "last_path": path, "last_status": status_code})

        # Sliding window — sorted set of request timestamps
        window_key = f"{key}:rate"
        await r.zadd(window_key, {str(now_ts): now_ts})
        # Remove entries outside the window
        cutoff = now_ts - settings.IP_RATE_WINDOW
        await r.zremrangebyscore(window_key, 0, cutoff)
        # Set TTL on the rate key
        await r.expire(window_key, settings.IP_RATE_WINDOW + 10)

        # Count requests in the current window
        window_count = await r.zcard(window_key)

        # Track subdomains visited by this IP
        if subdomain:
            await r.sadd(f"{key}:tunnels", subdomain)
            await r.expire(f"{key}:tunnels", 86400)  # 24h

        # Track user agent
        if user_agent:
            await r.hset(key, mapping={"user_agent": user_agent[:255]})

        # Update the IP's rate count in the main hash
        await r.hset(key, mapping={"window_count": window_count})

        # Set TTL on the main key (24h of inactivity → expire)
        await r.expire(key, 86400)

        # Check if IP should be auto-blocked
        if window_count >= settings.IP_RATE_BLOCK_THRESHOLD:
            await block_ip(ip, reason="auto_rate_limit", duration=settings.IP_BLOCK_DURATION)

        # Return summary
        info = await get_ip_info(ip)
        if info:
            info["window_count"] = window_count
        return info
    except Exception as e:
        logger.debug("Redis record_request error: %s", e)
        return None


async def block_ip(ip: str, reason: str = "manual", duration: int = 3600) -> bool:
    """Block an IP for a given duration (seconds)."""
    r = get_redis()
    if r is None:
        return False
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        await r.hset("blocklist:ips", ip, json.dumps({"reason": reason, "blocked_at": now_iso}))
        await r.setex(f"blocked:{ip}", duration, reason)
        logger.info("IP blocked: %s (reason=%s, duration=%ss)", ip, reason, duration)
        return True
    except Exception as e:
        logger.debug("Redis block_ip error: %s", e)
        return False


async def unblock_ip(ip: str) -> bool:
    """Remove an IP from the blocklist."""
    r = get_redis()
    if r is None:
        return False
    try:
        await r.hdel("blocklist:ips", ip)
        await r.delete(f"blocked:{ip}")
        logger.info("IP unblocked: %s", ip)
        return True
    except Exception as e:
        logger.debug("Redis unblock_ip error: %s", e)
        return False


async def is_blocked(ip: str) -> bool:
    """Check if an IP is currently blocked."""
    r = get_redis()
    if r is None:
        return False
    try:
        return await r.exists(f"blocked:{ip}") > 0
    except Exception:
        return False


async def get_ip_info(ip: str) -> dict[str, Any] | None:
    """Get all stored info about an IP."""
    r = get_redis()
    if r is None:
        return None
    try:
        key = _ip_key(ip)
        data = await r.hgetall(key)
        if not data:
            return None
        tunnels = await r.smembers(f"{key}:tunnels")
        blocked = await is_blocked(ip)
        return {
            "ip": ip,
            "total_requests": int(data.get("total_requests", 0)),
            "window_count": int(data.get("window_count", 0)),
            "first_seen": data.get("first_seen", ""),
            "last_seen": data.get("last_seen", ""),
            "last_path": data.get("last_path", ""),
            "last_status": int(data.get("last_status", 0)),
            "user_agent": data.get("user_agent", ""),
            "country": data.get("country", ""),
            "country_code": data.get("country_code", ""),
            "city": data.get("city", ""),
            "isp": data.get("isp", ""),
            "lat": data.get("lat", ""),
            "lon": data.get("lon", ""),
            "tunnels": list(tunnels) if tunnels else [],
            "blocked": blocked,
        }
    except Exception as e:
        logger.debug("Redis get_ip_info error: %s", e)
        return None


async def lookup_geo(ip: str) -> dict[str, str] | None:
    """Look up geolocation for an IP using the configured API."""
    if not settings.IP_GEO_ENABLED:
        return None
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.IP_GEO_API_URL}{ip}")
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "country": data.get("country", ""),
                    "country_code": data.get("countryCode", ""),
                    "city": data.get("city", ""),
                    "isp": data.get("isp", ""),
                    "lat": str(data.get("lat", "")),
                    "lon": str(data.get("lon", "")),
                }
    except Exception as e:
        logger.debug("Geo lookup failed for %s: %s", ip, e)
    return None


async def store_geo(ip: str, geo: dict[str, str]) -> None:
    """Store geo info for an IP in Redis."""
    r = get_redis()
    if r is None:
        return
    try:
        key = _ip_key(ip)
        await r.hset(key, mapping={
            "country": geo.get("country", ""),
            "country_code": geo.get("country_code", ""),
            "city": geo.get("city", ""),
            "isp": geo.get("isp", ""),
            "lat": geo.get("lat", ""),
            "lon": geo.get("lon", ""),
        })
        await r.expire(key, 86400)
    except Exception as e:
        logger.debug("Redis store_geo error: %s", e)


async def list_tracked_ips(limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """List tracked IPs sorted by last seen (most recent first)."""
    r = get_redis()
    if r is None:
        return []
    try:
        # Scan for ip:* keys (excluding rate/tunnels sub-keys)
        keys = []
        async for key in r.scan_iter(match="ip:*", count=200):
            # Skip sub-keys like ip:1.2.3.4:rate or ip:1.2.3.4:tunnels
            if key.endswith(":rate") or key.endswith(":tunnels"):
                continue
            keys.append(key.replace("ip:", "", 1))

        # Get info for each IP
        all_ips = []
        for ip in keys:
            info = await get_ip_info(ip)
            if info:
                all_ips.append(info)

        # Sort by last_seen descending
        all_ips.sort(key=lambda x: x.get("last_seen", ""), reverse=True)

        # Apply pagination
        return all_ips[offset:offset + limit]
    except Exception as e:
        logger.debug("Redis list_tracked_ips error: %s", e)
        return []


async def list_blocked_ips() -> list[dict[str, Any]]:
    """List all blocked IPs."""
    r = get_redis()
    if r is None:
        return []
    try:
        blocklist = await r.hgetall("blocklist:ips")
        result = []
        for ip, raw in blocklist.items():
            try:
                info = json.loads(raw)
            except Exception:
                info = {"reason": "unknown", "blocked_at": ""}
            result.append({"ip": ip, **info})
        # Sort by blocked_at descending
        result.sort(key=lambda x: x.get("blocked_at", ""), reverse=True)
        return result
    except Exception as e:
        logger.debug("Redis list_blocked_ips error: %s", e)
        return []


async def get_monitor_stats() -> dict[str, Any]:
    """Get summary statistics for the monitor dashboard."""
    r = get_redis()
    if r is None:
        return {"enabled": False}
    try:
        # Count tracked IPs
        tracked = 0
        async for key in r.scan_iter(match="ip:*", count=200):
            if not key.endswith(":rate") and not key.endswith(":tunnels"):
                tracked += 1

        # Count blocked IPs
        blocklist = await r.hlen("blocklist:ips")

        # Top countries
        countries: dict[str, int] = {}
        async for key in r.scan_iter(match="ip:*", count=200):
            if key.endswith(":rate") or key.endswith(":tunnels"):
                continue
            country = await r.hget(key, "country")
            if country:
                countries[country] = countries.get(country, 0) + 1
        top_countries = sorted(countries.items(), key=lambda x: x[1], reverse=True)[:10]

        return {
            "enabled": True,
            "tracked_ips": tracked,
            "blocked_ips": blocklist,
            "top_countries": top_countries,
        }
    except Exception as e:
        logger.debug("Redis get_monitor_stats error: %s", e)
        return {"enabled": True, "error": str(e)}