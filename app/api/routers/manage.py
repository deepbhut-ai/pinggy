"""Management REST API (v0.10.0) — script/CI access via X-Api-Key.

Mirrors the dashboard's core operations so tunnels/tokens/domains can be
managed programmatically (the SDK wraps these).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection

from app.core.db import get_db
from app.core.deps import get_api_user

router = APIRouter(prefix="/manage", tags=["manage"])


# ---------------- Tunnels ----------------

@router.get("/tunnels")
async def manage_tunnels(
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """List the key owner's tunnels (live registry + recent history)."""
    from app.core.tunnel_registry import list_tunnels
    live = [t for t in await list_tunnels() if t.user_email == user["email"]]
    cur = await db.execute(
        "SELECT tunnel_id, subdomain, remote_port, status, request_count, bytes_transferred, created_at "
        "FROM tunnels WHERE user_email = %s ORDER BY created_at DESC LIMIT 50",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return {
        "live": [
            {"tunnel_id": t.tunnel_id, "subdomain": t.subdomain, "url": t.url,
             "remote_port": t.remote_port, "requests": t.request_count,
             "bytes": t.bytes_transferred, "since": t.created_at.isoformat()}
            for t in live
        ],
        "history": [
            {"tunnel_id": r[0], "subdomain": r[1], "remote_port": r[2], "status": r[3],
             "requests": r[4], "bytes": r[5], "created_at": r[6].isoformat() if r[6] else None}
            for r in rows
        ],
    }


@router.post("/tunnels/{subdomain}/stop")
async def manage_stop_tunnel(
    subdomain: str,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Stop one of the owner's live tunnels by subdomain."""
    from app.core.tunnel_registry import remove_tunnel
    tunnel = await remove_tunnel(subdomain)
    if not tunnel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tunnel not found")
    if tunnel.user_email != user["email"] and user["role"] != "admin":
        # put it back — not theirs
        from app.core.tunnel_registry import register_tunnel
        await register_tunnel(tunnel)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your tunnel")
    if tunnel.ssh_conn:
        try:
            tunnel.ssh_conn.close()
        except Exception:
            pass
    cur = await db.execute(
        "UPDATE tunnels SET status='disconnected', closed_at=now() WHERE subdomain = %s",
        (subdomain,),
    )
    await cur.close()
    return {"stopped": subdomain}


# ---------------- Tokens ----------------

@router.get("/tokens")
async def manage_tokens(
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "SELECT id, token, name, custom_domain, fixed_subdomain, created_at FROM tokens "
        "WHERE user_email = %s ORDER BY created_at DESC",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        {"id": str(r[0]), "token": r[1], "name": r[2], "custom_domain": r[3],
         "fixed_subdomain": r[4], "created_at": r[5].isoformat() if r[5] else None}
        for r in rows
    ]


@router.post("/tokens")
async def manage_create_token(
    body: dict,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a token: {name?, fixed_subdomain?, custom_domain?}."""
    import secrets as _secrets
    name = (body.get("name") or "API token").strip()
    sub = (body.get("fixed_subdomain") or "").strip().lower() or None
    cd = (body.get("custom_domain") or "").strip().lower() or None
    if sub:
        import re as _re
        if not _re.fullmatch(r"[a-z0-9][a-z0-9-]{2,49}", sub):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid fixed_subdomain")
        cur = await db.execute("SELECT 1 FROM tokens WHERE fixed_subdomain = %s", (sub,))
        if await cur.fetchone():
            await cur.close()
            raise HTTPException(status.HTTP_409_CONFLICT, "subdomain taken")
        await cur.close()
    token = _secrets.token_hex(8)
    cur = await db.execute(
        "INSERT INTO tokens (user_email, token, name, custom_domain, fixed_subdomain) "
        "VALUES (%s, %s, %s, %s, %s) RETURNING id, created_at",
        (user["email"], token, name, cd, sub),
    )
    r = await cur.fetchone()
    await cur.close()
    return {"id": str(r[0]), "token": token, "name": name,
            "custom_domain": cd, "fixed_subdomain": sub,
            "created_at": r[1].isoformat() if r[1] else None}


@router.delete("/tokens/{token_id}")
async def manage_delete_token(
    token_id: str,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "DELETE FROM tokens WHERE id = %s AND user_email = %s RETURNING token",
        (token_id, user["email"]),
    )
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    return {"deleted": r[0][:8] + "…"}
