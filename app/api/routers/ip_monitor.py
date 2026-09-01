"""IP Monitor router — admin endpoints for IP monitoring and attack defense."""
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.config import settings
from app.core.deps import get_admin_user
from app.core.db import get_db
from app.core.redis import (
    block_ip,
    get_effective_monitor_config,
    get_ip_info,
    get_monitor_stats,
    get_redis,
    list_blocked_ips,
    list_tracked_ips,
    lookup_geo,
    redis_available,
    set_monitor_config_overrides,
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
    db: AsyncConnection = Depends(get_db),
):
    """Block an IP address."""
    if not redis_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    success = await block_ip(payload.ip, reason=payload.reason, duration=payload.duration)
    if not success:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to block IP")
    await log_audit(db, admin["email"], "ip.block", payload.ip, f"reason={payload.reason} duration={payload.duration}s")
    return {"detail": f"IP {payload.ip} blocked for {payload.duration}s (reason: {payload.reason})"}


@router.post("/unblock")
async def unblock_ip_endpoint(
    payload: UnblockRequest,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Unblock an IP address."""
    if not redis_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    success = await unblock_ip(payload.ip)
    if not success:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to unblock IP")
    await log_audit(db, admin["email"], "ip.unblock", payload.ip, "manual unblock")
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
    """Get the EFFECTIVE IP monitor configuration (env defaults + runtime overrides)."""
    cfg = await get_effective_monitor_config()
    return {
        "redis_enabled": settings.REDIS_ENABLED,
        "redis_connected": redis_available(),
        "redis_url": settings.REDIS_URL,
        "rate_window_seconds": cfg["rate_window_seconds"],
        "block_threshold": cfg["block_threshold"],
        "block_duration_seconds": cfg["block_duration_seconds"],
        "auto_block_enabled": cfg["auto_block_enabled"],
        "config_source": cfg["source"],
        "geo_enabled": settings.IP_GEO_ENABLED,
        "geo_api_url": settings.IP_GEO_API_URL,
    }


class MonitorConfigUpdate(BaseModel):
    auto_block_enabled: bool | None = None
    rate_window_seconds: int | None = Field(default=None, ge=10, le=86400)
    block_threshold: int | None = Field(default=None, ge=10, le=1_000_000)
    block_duration_seconds: int | None = Field(default=None, ge=60, le=2_592_000)


@router.put("/config")
async def update_monitor_config(
    payload: MonitorConfigUpdate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update runtime IP monitor settings (stored in Redis, no restart needed)."""
    if not redis_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    overrides: dict = {}
    if payload.auto_block_enabled is not None:
        overrides["auto_block"] = payload.auto_block_enabled
    if payload.rate_window_seconds is not None:
        overrides["rate_window"] = payload.rate_window_seconds
    if payload.block_threshold is not None:
        overrides["block_threshold"] = payload.block_threshold
    if payload.block_duration_seconds is not None:
        overrides["block_duration"] = payload.block_duration_seconds
    if not overrides:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No settings provided")
    await set_monitor_config_overrides(overrides)
    await log_audit(db, admin["email"], "ip_monitor.config_update", "", json.dumps(payload.model_dump(exclude_none=True)))
    cfg = await get_effective_monitor_config()
    return {
        "detail": "IP monitor settings updated",
        "rate_window_seconds": cfg["rate_window_seconds"],
        "block_threshold": cfg["block_threshold"],
        "block_duration_seconds": cfg["block_duration_seconds"],
        "auto_block_enabled": cfg["auto_block_enabled"],
        "config_source": cfg["source"],
    }