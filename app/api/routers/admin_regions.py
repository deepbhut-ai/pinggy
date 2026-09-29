"""Admin Regions Router — manage, monitor, and configure multi-region edge servers."""
import asyncio
import socket
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user

import secrets
from app.core.cloudflare import sync_region_dns

router = APIRouter(tags=["admin-regions"])

_COLS = (
    "code, name, flag, server_ip, ssh_host, ssh_port, proxy_domain, "
    "is_active, is_maintenance, max_capacity, sort_order, node_secret, created_at, updated_at"
)


class RegionOut(BaseModel):
    code: str
    name: str
    flag: str = "🌐"
    server_ip: str
    ssh_host: str
    ssh_port: int = 2222
    proxy_domain: str
    is_active: bool = True
    is_maintenance: bool = False
    max_capacity: int = 1000
    active_tunnels: int = 0
    sort_order: int = 0
    node_secret: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class RegionCreate(BaseModel):
    code: str = Field(min_length=2, max_length=20, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=2, max_length=100)
    flag: str = Field(default="🌐", max_length=10)
    server_ip: str = Field(min_length=7, max_length=45)
    ssh_host: str = Field(min_length=3, max_length=255)
    ssh_port: int = Field(default=2222, ge=1, le=65535)
    proxy_domain: str = Field(min_length=3, max_length=255)
    is_active: bool = True
    is_maintenance: bool = False
    max_capacity: int = Field(default=1000, ge=1)
    sort_order: int = 0
    node_secret: str | None = None


class RegionUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    flag: str | None = Field(default=None, max_length=10)
    server_ip: str | None = Field(default=None, max_length=45)
    ssh_host: str | None = Field(default=None, max_length=255)
    ssh_port: int | None = Field(default=None, ge=1, le=65535)
    proxy_domain: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    is_maintenance: bool | None = None
    max_capacity: int | None = Field(default=None, ge=1)
    sort_order: int | None = None
    node_secret: str | None = None


def _row_to_out(r: tuple, active_tunnels: int = 0) -> RegionOut:
    has_secret = len(r) >= 14
    return RegionOut(
        code=r[0],
        name=r[1],
        flag=r[2] or "🌐",
        server_ip=r[3],
        ssh_host=r[4],
        ssh_port=int(r[5] or 2222),
        proxy_domain=r[6],
        is_active=bool(r[7]),
        is_maintenance=bool(r[8]),
        max_capacity=int(r[9] or 1000),
        active_tunnels=active_tunnels,
        sort_order=int(r[10] or 0),
        node_secret=r[11] if has_secret else None,
        created_at=r[12].isoformat() if has_secret and r[12] else (r[11].isoformat() if len(r) > 11 and r[11] and hasattr(r[11], "isoformat") else None),
        updated_at=r[13].isoformat() if has_secret and r[13] else (r[12].isoformat() if len(r) > 12 and r[12] and hasattr(r[12], "isoformat") else None),
    )


async def _probe_port(host: str, port: int, timeout: float = 2.0) -> tuple[bool, int | None]:
    """Test TCP socket reachability and measure round-trip latency in ms."""
    start = time.monotonic()
    try:
        coro = asyncio.open_connection(host, port)
        reader, writer = await asyncio.wait_for(coro, timeout=timeout)
        writer.close()
        await writer.wait_closed()
        latency = int((time.monotonic() - start) * 1000)
        return True, max(1, latency)
    except Exception:
        return False, None


# ================================================================
# Public Regions Endpoint (for Dashboard & CLI consumers)
# ================================================================

@router.get("/regions")
async def list_public_regions(db: AsyncConnection = Depends(get_db)) -> list[dict[str, Any]]:
    """Public list of active and available edge regions."""
    try:
        cur = await db.execute(
            "SELECT code, name, flag, ssh_host, ssh_port, is_maintenance "
            "FROM regions WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC"
        )
        rows = await cur.fetchall()
        await cur.close()
        return [
            {
                "code": r[0],
                "name": r[1],
                "flag": r[2] or "🌐",
                "ssh_host": r[3],
                "ssh_port": r[4],
                "is_maintenance": r[5],
            }
            for r in rows
        ]
    except Exception:
        # Fallback to local default if table not yet migrated
        from app.core.config import settings
        return [
            {
                "code": "in",
                "name": "Asia South (India)",
                "flag": "🇮🇳",
                "ssh_host": f"ssh.{settings.TUNNEL_DOMAIN}",
                "ssh_port": settings.SSH_PORT,
                "is_maintenance": False,
            }
        ]


# ================================================================
# Admin Edge Regions Endpoints
# ================================================================

@router.get("/admin/regions", response_model=list[RegionOut])
async def admin_list_regions(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all registered edge regions with live active tunnel metrics."""
    # Count current active tunnels from registry
    from app.core.tunnel_registry import list_tunnels
    active_tunnels_list = await list_tunnels()
    total_active = len(active_tunnels_list)

    cur = await db.execute(f"SELECT {_COLS} FROM regions ORDER BY sort_order ASC, created_at ASC")
    rows = await cur.fetchall()
    await cur.close()

    # If only 1 region exists, attribute all active tunnels to it; otherwise map
    out = []
    for r in rows:
        region_code = r[0]
        # Currently single primary node hosts the active sessions
        node_tunnels = total_active if region_code == "in" or len(rows) == 1 else 0
        out.append(_row_to_out(r, active_tunnels=node_tunnels))
    return out


@router.post("/admin/regions", response_model=RegionOut, status_code=status.HTTP_201_CREATED)
async def admin_create_region(
    body: RegionCreate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Register a new regional edge server."""
    code = body.code.strip().lower()

    cur = await db.execute("SELECT 1 FROM regions WHERE code = %s", (code,))
    if await cur.fetchone():
        await cur.close()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Region code '{code}' already exists")
    await cur.close()

    secret = body.node_secret.strip() if body.node_secret else f"edge_sec_{secrets.token_hex(16)}"

    cur = await db.execute(
        f"""
        INSERT INTO regions (code, name, flag, server_ip, ssh_host, ssh_port, proxy_domain,
                             is_active, is_maintenance, max_capacity, sort_order, node_secret)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING {_COLS}
        """,
        (
            code,
            body.name.strip(),
            body.flag.strip() or "🌐",
            body.server_ip.strip(),
            body.ssh_host.strip().lower(),
            body.ssh_port,
            body.proxy_domain.strip().lower(),
            body.is_active,
            body.is_maintenance,
            body.max_capacity,
            body.sort_order,
            secret,
        ),
    )
    row = await cur.fetchone()
    await cur.close()

    # Trigger Cloudflare DNS automation
    try:
        await sync_region_dns(code=code, server_ip=body.server_ip.strip(), db=db)
    except Exception as e:
        logger.warning("Cloudflare DNS auto-sync failed for region %s: %s", code, e)

    await log_audit(
        db,
        admin["email"],
        "region.create",
        code,
        f"Registered edge node '{body.name}' ({body.server_ip})",
    )
    return _row_to_out(row, active_tunnels=0)


@router.put("/admin/regions/{code}", response_model=RegionOut)
async def admin_update_region(
    code: str,
    body: RegionUpdate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update a region's configuration, capacity, or active state."""
    code = code.strip().lower()
    updates = []
    params = []

    if body.name is not None:
        updates.append("name = %s")
        params.append(body.name.strip())
    if body.flag is not None:
        updates.append("flag = %s")
        params.append(body.flag.strip() or "🌐")
    if body.server_ip is not None:
        updates.append("server_ip = %s")
        params.append(body.server_ip.strip())
    if body.ssh_host is not None:
        updates.append("ssh_host = %s")
        params.append(body.ssh_host.strip().lower())
    if body.ssh_port is not None:
        updates.append("ssh_port = %s")
        params.append(body.ssh_port)
    if body.proxy_domain is not None:
        updates.append("proxy_domain = %s")
        params.append(body.proxy_domain.strip().lower())
    if body.is_active is not None:
        updates.append("is_active = %s")
        params.append(body.is_active)
    if body.is_maintenance is not None:
        updates.append("is_maintenance = %s")
        params.append(body.is_maintenance)
    if body.max_capacity is not None:
        updates.append("max_capacity = %s")
        params.append(body.max_capacity)
    if body.sort_order is not None:
        updates.append("sort_order = %s")
        params.append(body.sort_order)

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    updates.append("updated_at = NOW()")
    params.append(code)

    cur = await db.execute(
        f"UPDATE regions SET {', '.join(updates)} WHERE code = %s RETURNING {_COLS}",
        tuple(params),
    )
    row = await cur.fetchone()
    await cur.close()

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Region '{code}' not found")

    await log_audit(
        db,
        admin["email"],
        "region.update",
        code,
        f"Updated region attributes ({', '.join(updates)})",
    )
    return _row_to_out(row)


@router.delete("/admin/regions/{code}", status_code=status.HTTP_200_OK)
async def admin_delete_region(
    code: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Decommission an edge region."""
    code = code.strip().lower()

    # Safety check: Prevent deleting if it's the only region in system
    cur = await db.execute("SELECT COUNT(*) FROM regions")
    count = (await cur.fetchone())[0]
    await cur.close()
    if count <= 1:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cannot delete the only remaining region. At least one region must remain active.",
        )

    cur = await db.execute("DELETE FROM regions WHERE code = %s RETURNING name", (code,))
    row = await cur.fetchone()
    await cur.close()

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Region '{code}' not found")

    await log_audit(
        db,
        admin["email"],
        "region.delete",
        code,
        f"Deleted edge node '{row[0]}'",
    )
    return {"message": f"Region '{code}' decommissioned successfully"}


@router.post("/admin/regions/{code}/ping")
async def admin_ping_region(
    code: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Perform a live network probe from the control plane to the regional edge node."""
    code = code.strip().lower()
    cur = await db.execute(
        "SELECT server_ip, ssh_port, ssh_host, name FROM regions WHERE code = %s",
        (code,),
    )
    row = await cur.fetchone()
    await cur.close()

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Region '{code}' not found")

    ip, port, host, name = row[0], int(row[1] or 2222), row[2], row[3]

    # Probe SSH listener
    reachable, latency = await _probe_port(ip, port, timeout=2.5)

    return {
        "code": code,
        "name": name,
        "server_ip": ip,
        "ssh_port": port,
        "reachable": reachable,
        "latency_ms": latency,
        "status": "online" if reachable else "offline",
        "message": f"Connected in {latency}ms" if reachable else "Connection timed out",
    }


@router.post("/admin/regions/{code}/drain")
async def admin_toggle_drain_mode(
    code: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Toggle maintenance / drain mode for an edge region."""
    code = code.strip().lower()
    cur = await db.execute(
        "UPDATE regions SET is_maintenance = NOT is_maintenance, updated_at = NOW() "
        "WHERE code = %s RETURNING is_maintenance, name",
        (code,),
    )
    row = await cur.fetchone()
    await cur.close()

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Region '{code}' not found")

    status_str = "DRAIN / MAINTENANCE" if row[0] else "ACTIVE"
    await log_audit(
        db,
        admin["email"],
        "region.drain_toggle",
        code,
        f"Set region '{row[1]}' to {status_str}",
    )
    return {
        "code": code,
        "is_maintenance": row[0],
        "status": status_str,
        "message": f"Region {code} is now in {status_str} mode",
    }
