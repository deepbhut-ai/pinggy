"""IP Monitor router — admin endpoints for IP monitoring and attack defense."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import get_admin_user
from app.core.redis import (
    block_ip,
    get_ip_info,
    get_monitor_stats,
    get_redis,
    list_blocked_ips,
    list_tracked_ips,
    lookup_geo,
    redis_available,
    store_geo,
    unblock_ip,
)

router = APIRouter(prefix="/ip-monitor", tags=["ip-monitor"])


class BlockRequest(BaseModel):
    ip: str
    reason: str = "manual"
    duration: int = 3600  # seconds


class UnblockRequest(BaseModel):
    ip: str


@router.get("/stats")
async def monitor_stats(admin: dict = Depends(get_admin_user)):
    """Get summary statistics — tracked IPs, blocked IPs, top countries."""
    if not redis_available():
        return {"enabled": False, "detail": "Redis not connected"}
    return await get_monitor_stats()


@router.get("/ips")
async def list_ips(
    admin: dict = Depends(get_admin_user),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List tracked IPs sorted by last seen (most recent first)."""
    if not redis_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    ips = await list_tracked_ips(limit=limit, offset=offset)
    return {"ips": ips, "count": len(ips)}


@router.get("/ips/{ip}")
async def ip_details(ip: str, admin: dict = Depends(get_admin_user)):
    """Get detailed info about a specific IP."""
    if not redis_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    info = await get_ip_info(ip)
    if not info:
        # Try geo lookup if not tracked yet
        geo = await lookup_geo(ip)
        if geo:
            await store_geo(ip, geo)
            info = await get_ip_info(ip)
        if not info:
            info = {"ip": ip, "total_requests": 0, "tracked": False}
            if geo:
                info.update(geo)
    return info


@router.post("/block")
async def block_ip_endpoint(
    payload: BlockRequest,
    admin: dict = Depends(get_admin_user),
):
    """Block an IP address."""
    if not redis_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    success = await block_ip(payload.ip, reason=payload.reason, duration=payload.duration)
    if not success:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to block IP")
    return {"detail": f"IP {payload.ip} blocked for {payload.duration}s (reason: {payload.reason})"}


@router.post("/unblock")
async def unblock_ip_endpoint(
    payload: UnblockRequest,
    admin: dict = Depends(get_admin_user),
):
    """Unblock an IP address."""
    if not redis_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    success = await unblock_ip(payload.ip)
    if not success:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to unblock IP")
    return {"detail": f"IP {payload.ip} unblocked"}


@router.get("/blocked")
async def list_blocked(admin: dict = Depends(get_admin_user)):
    """List all blocked IPs."""
    if not redis_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    blocked = await list_blocked_ips()
    return {"blocked": blocked, "count": len(blocked)}


@router.post("/geo/{ip}")
async def refresh_geo(ip: str, admin: dict = Depends(get_admin_user)):
    """Force a geo lookup for an IP and store the result."""
    if not redis_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    geo = await lookup_geo(ip)
    if not geo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Geo lookup failed")
    await store_geo(ip, geo)
    return {"ip": ip, "geo": geo}


@router.get("/config")
async def monitor_config(admin: dict = Depends(get_admin_user)):
    """Get current IP monitor configuration."""
    return {
        "redis_enabled": settings.REDIS_ENABLED,
        "redis_connected": redis_available(),
        "redis_url": settings.REDIS_URL,
        "rate_window_seconds": settings.IP_RATE_WINDOW,
        "block_threshold": settings.IP_RATE_BLOCK_THRESHOLD,
        "block_duration_seconds": settings.IP_BLOCK_DURATION,
        "geo_enabled": settings.IP_GEO_ENABLED,
        "geo_api_url": settings.IP_GEO_API_URL,
    }