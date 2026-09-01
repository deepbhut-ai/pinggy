"""Web Debugger router (v0.11.0) — inspect captured tunnel traffic + replay.

Capture happens in TunnelProxyMiddleware (Redis ring buffer per subdomain,
last 100 requests, 1h TTL). This router exposes list/detail/clear + replay.
"""
import json
import time

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection

from app.core.db import get_db
from app.core.deps import get_current_user

router = APIRouter(prefix="/debugger", tags=["debugger"])


async def _check_tunnel_owner(subdomain: str, user: dict, db: AsyncConnection) -> None:
    from app.core.tunnel_registry import get_tunnel
    t = await get_tunnel(subdomain)
    if t:
        if t.user_email != user["email"] and user["role"] != "admin":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your tunnel")
        return
    # fall back to DB history ownership
    cur = await db.execute(
        "SELECT 1 FROM tunnels WHERE subdomain = %s AND user_email = %s LIMIT 1",
        (subdomain, user["email"]),
    )
    owned = await cur.fetchone()
    await cur.close()
    if not owned and user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your tunnel")


@router.get("/{subdomain}")
async def list_captures(
    subdomain: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Captured request/response pairs, newest first (max 100, 1h window)."""
    await _check_tunnel_owner(subdomain, user, db)
    from app.core.redis import get_redis
    r = get_redis()
    if r is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis not connected")
    raw = await r.lrange(f"dbg:{subdomain}", 0, -1)
    entries = [json.loads(x) for x in reversed(raw)]
    return {"subdomain": subdomain, "count": len(entries), "entries": entries}


@router.delete("/{subdomain}")
async def clear_captures(
    subdomain: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    await _check_tunnel_owner(subdomain, user, db)
    from app.core.redis import get_redis
    r = get_redis()
    if r is not None:
        await r.delete(f"dbg:{subdomain}")
    return {"cleared": subdomain}


@router.post("/{subdomain}/replay")
async def replay_request(
    subdomain: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Replay a captured (or crafted) request: {index} or {method, path, headers?, body?}."""
    await _check_tunnel_owner(subdomain, user, db)
    from app.core.redis import get_redis
    from app.core.tunnel_registry import get_tunnel
    t = await get_tunnel(subdomain)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tunnel not live")

    entry = None
    if "index" in body:
        r = get_redis()
        if r is not None:
            raw = await r.lrange(f"dbg:{subdomain}", 0, -1)
            entries = [json.loads(x) for x in raw]
            idx = int(body["index"])
            if 0 <= idx < len(entries):
                entry = entries[len(entries) - 1 - idx]  # index 0 = newest
    method = (body.get("method") or (entry or {}).get("method") or "GET").upper()
    path = body.get("path") or (entry or {}).get("path") or "/"
    headers = body.get("headers") or (entry or {}).get("req_headers") or {}
    payload = body.get("body") if body.get("body") is not None else (entry or {}).get("body")

    import httpx
    url = f"http://127.0.0.1:{t.remote_port}{path}"
    fwd = {k: v for k, v in headers.items() if k.lower() not in ("host", "content-length", "connection")}
    fwd["host"] = f"localhost:{t.local_port}"
    started = time.monotonic()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.request(method, url, headers=fwd,
                                    content=payload.encode() if isinstance(payload, str) and payload else None,
                                    follow_redirects=False)
    elapsed_ms = int((time.monotonic() - started) * 1000)
    return {
        "replayed": f"{method} {path}", "status": resp.status_code, "elapsed_ms": elapsed_ms,
        "response_headers": dict(list(resp.headers.items())[:20]),
        "response_body": resp.text[:4096],
    }
