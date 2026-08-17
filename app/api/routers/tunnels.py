"""Tunnel management API — list, view, delete tunnels."""
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection

from app.core.db import get_db
from app.core.deps import get_admin_user
from app.core.tunnel_registry import list_tunnels, remove_tunnel
from app.schemas.tunnel import TunnelOut

router = APIRouter(prefix="/tunnels", tags=["tunnels"])


@router.get("", response_model=list[TunnelOut])
async def list_active_tunnels(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all active tunnels (admin only)."""
    tunnels = await list_tunnels()
    return [
        TunnelOut(
            tunnel_id=t.tunnel_id,
            subdomain=t.subdomain,
            url=t.url,
            remote_port=t.remote_port,
            local_port=t.local_port,
            protocol=t.protocol,
            user_email=t.user_email,
            ssh_peer=t.ssh_peer,
            status="active" if t.is_alive else "disconnected",
            request_count=t.request_count,
            bytes_transferred=t.bytes_transferred,
            created_at=t.created_at.isoformat(),
        )
        for t in tunnels
    ]


@router.get("/history", response_model=list[TunnelOut])
async def tunnel_history(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = 50,
):
    """List tunnel history from DB (including closed tunnels)."""
    cur = await db.execute(
        "SELECT tunnel_id, subdomain, remote_port, local_port, protocol, "
        "user_email, ssh_peer, status, request_count, bytes_transferred, created_at "
        "FROM tunnels ORDER BY created_at DESC LIMIT %s",
        (limit,),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        TunnelOut(
            tunnel_id=r[0],
            subdomain=r[1],
            url=f"http://{r[1]}.localhost:8080",
            remote_port=r[2],
            local_port=r[3],
            protocol=r[4],
            user_email=r[5] or "",
            ssh_peer=r[6] or "",
            status=r[7],
            request_count=r[8],
            bytes_transferred=r[9],
            created_at=r[10].isoformat() if r[10] else "",
        )
        for r in rows
    ]


@router.delete("/{subdomain}", status_code=status.HTTP_200_OK)
async def stop_tunnel(
    subdomain: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Force-stop a tunnel by subdomain (admin only)."""
    tunnel = await remove_tunnel(subdomain)
    if not tunnel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tunnel not found")

    # Close the SSH connection
    if tunnel.ssh_conn:
        tunnel.ssh_conn.close()

    # Update DB
    cur = await db.execute(
        "UPDATE tunnels SET status = 'disconnected', closed_at = now() WHERE subdomain = %s",
        (subdomain,),
    )
    await cur.close()

    return {"message": f"Tunnel {subdomain} stopped"}