"""Tunnel management API — list, view, delete tunnels."""
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_admin_user, get_current_user
from app.core.tunnel_registry import list_tunnels, remove_tunnel
from app.schemas.tunnel import TunnelOut

router = APIRouter(prefix="/tunnels", tags=["tunnels"])


@router.get("/qr")
async def tunnel_qr(
    text: str,
    user: dict = Depends(get_current_user),
):
    """QR code (SVG) for a tunnel URL — mobile-friendly testing (v0.7.0)."""
    from fastapi import HTTPException, status
    if not text or len(text) > 512:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "text required (max 512 chars)")
    import io
    import qrcode
    import qrcode.image.svg
    buf = io.BytesIO()
    img = qrcode.make(text[:512], image_factory=qrcode.image.svg.SvgPathImage)
    img.save(buf)
    from fastapi.responses import Response
    return Response(content=buf.getvalue(), media_type="image/svg+xml")


@router.get("/info")
async def tunnel_info(user: dict = Depends(get_current_user)):
    """Return SSH connection instructions for the current user.
    Available to any logged-in user (not just admin)."""
    return {
        "domain": settings.TUNNEL_DOMAIN,
        "ssh_port": settings.SSH_PORT,
        "ssh_command": f"ssh -p {settings.SSH_PORT} -R0:localhost:PORT {settings.TUNNEL_DOMAIN}",
        "ssh_command_example": f"ssh -p {settings.SSH_PORT} -R0:localhost:8080 {settings.TUNNEL_DOMAIN}",
        "url_format": f"https://[your-code].{settings.TUNNEL_DOMAIN}",
        "url_example": f"https://abc123.{settings.TUNNEL_DOMAIN}",
        "custom_domain": user.get("custom_domain"),
        "instructions": [
            f"1. Start your local service (e.g., on port 8080)",
            f"2. Run: ssh -p {settings.SSH_PORT} -R0:localhost:8080 {settings.TUNNEL_DOMAIN}",
            f"3. Server will print your tunnel URL (e.g., https://abc123.{settings.TUNNEL_DOMAIN})",
            f"4. Share that URL — anyone can access your local service",
        ],
    }


@router.get("/my", response_model=list[TunnelOut])
async def my_tunnels(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List active tunnels for the current user (by email/username).
    Available to any logged-in user — sees only their own tunnels."""
    all_tunnels = await list_tunnels()
    my = [t for t in all_tunnels if t.user_email == user["email"]]
    return [
        TunnelOut(
            tunnel_id=t.tunnel_id,
            subdomain=t.subdomain,
            url=t.url,
            custom_domain=t.custom_domain,
            custom_url=t.custom_url,
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
        for t in my
    ]


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
            custom_domain=t.custom_domain,
            custom_url=t.custom_url,
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
            url=f"https://{r[1]}.{settings.TUNNEL_DOMAIN}",
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


@router.post("/{subdomain}/stop")
async def user_stop_tunnel(
    subdomain: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Stop your own tunnel by subdomain (any logged-in user)."""
    tunnel = await remove_tunnel(subdomain)
    if not tunnel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tunnel not found")

    # Verify ownership
    if tunnel.user_email != user["email"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only stop your own tunnels")

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


@router.get("/stats")
async def tunnel_stats(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get dashboard stats (admin only)."""
    # Total users
    cur = await db.execute("SELECT COUNT(*) FROM users")
    total_users = (await cur.fetchone())[0]
    await cur.close()

    # Total tunnels (all time)
    cur = await db.execute("SELECT COUNT(*) FROM tunnels")
    total_tunnels = (await cur.fetchone())[0]
    await cur.close()

    # Active tunnels (from registry)
    from app.core.tunnel_registry import list_tunnels
    active_tunnels = len(await list_tunnels())

    # Total requests
    cur = await db.execute("SELECT COALESCE(SUM(request_count), 0) FROM tunnels")
    total_requests = (await cur.fetchone())[0]
    await cur.close()

    # Total data transferred
    cur = await db.execute("SELECT COALESCE(SUM(bytes_transferred), 0) FROM tunnels")
    total_bytes = (await cur.fetchone())[0]
    await cur.close()

    return {
        "total_users": total_users,
        "total_tunnels": total_tunnels,
        "active_tunnels": active_tunnels,
        "total_requests": total_requests,
        "total_bytes_transferred": total_bytes,
    }