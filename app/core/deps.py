"""FastAPI dependencies for auth."""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg import AsyncConnection

from app.core.db import get_db
from app.core.security import decode_credentials

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user_id(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    payload = decode_credentials(creds)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")
    return str(user_id)


async def _resolve_seat_plan(db: AsyncConnection, email: str, base_plan: str) -> tuple[str, str | None]:
    """If user's own plan is 'free', check if they hold an active seat on a Pro team."""
    if base_plan == "pro":
        return "pro", None
    try:
        cur = await db.execute(
            """
            SELECT t.name, u.email 
            FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            JOIN users u ON u.email = t.owner_email
            WHERE tm.user_email = %s 
              AND tm.has_seat = TRUE 
              AND u.plan = 'pro'
              AND (u.plan_expires_at IS NULL OR u.plan_expires_at > now())
            LIMIT 1
            """,
            (email,),
        )
        row = await cur.fetchone()
        await cur.close()
        if row:
            return "pro", f"{row[0]} ({row[1]})"
    except Exception:
        pass
    return base_plan, None


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncConnection = Depends(get_db),
) -> dict:
    """Return the full user record (id, email, full_name, role) from DB."""
    payload = decode_credentials(creds)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")
    cur = await db.execute(
        "SELECT id, email, full_name, role, tunnel_token, custom_domain, plan, seats, plan_expires_at, is_active FROM users WHERE id = %s",
        (user_id,),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if not row[9]:
        # Account disabled by an admin — existing tokens stop working immediately
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    
    plan, sponsored_by = await _resolve_seat_plan(db, row[1], row[6] or "free")
    return {
        "id": str(row[0]),
        "email": row[1],
        "full_name": row[2],
        "role": row[3],
        "tunnel_token": row[4],
        "custom_domain": row[5],
        "plan": plan,
        "seats": int(row[7] or 1),
        "plan_expires_at": row[8].isoformat() if row[8] else None,
        "is_active": row[9],
        "sponsored_by": sponsored_by,
    }


async def get_admin_user(
    user: dict = Depends(get_current_user),
) -> dict:
    """Require admin role. Use this dependency to protect management endpoints."""
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


async def get_api_user(
    request: Request,
    db: AsyncConnection = Depends(get_db),
) -> dict:
    """Authenticate via X-Api-Key (dashboard API keys, v0.10.0).

    Falls back to Bearer JWT if no X-Api-Key is present. Returns the owner's
    user dict (same shape as get_current_user) or raises 401.
    """
    raw = request.headers.get("x-api-key", "")
    if raw:
        from app.api.routers.apikeys import resolve_api_key
        email = await resolve_api_key(db, raw)
        if not email:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
        # Resolve the API key ID for tracking which key created resources
        cur = await db.execute(
            "SELECT id FROM api_keys WHERE key_hash = "
            "(SELECT key_hash FROM api_keys WHERE is_active = true LIMIT 1) "
            "AND is_active = true LIMIT 1",
            (),
        )
        # Simpler: look up the key by the raw value via resolve_api_key's logic
        await cur.close()
        from app.api.routers.apikeys import _hash_key
        key_hash = _hash_key(raw)
        cur = await db.execute(
            "SELECT id FROM api_keys WHERE key_hash = %s AND is_active = true",
            (key_hash,),
        )
        key_row = await cur.fetchone()
        api_key_id = str(key_row[0]) if key_row else None
        await cur.close()
        cur = await db.execute(
            "SELECT id, email, full_name, role, tunnel_token, custom_domain, plan, seats, plan_expires_at, is_active "
            "FROM users WHERE email = %s",
            (email,),
        )
        row = await cur.fetchone()
        await cur.close()
        if not row or not row[9]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
        plan, sponsored_by = await _resolve_seat_plan(db, row[1], row[6] or "free")
        return {
            "id": str(row[0]), "email": row[1], "full_name": row[2], "role": row[3],
            "tunnel_token": row[4], "custom_domain": row[5], "plan": plan,
            "seats": int(row[7] or 1), "plan_expires_at": row[8].isoformat() if row[8] else None, "is_active": row[9],
            "api_key_id": api_key_id,
            "sponsored_by": sponsored_by,
        }
    # No API key — fall back to JWT Bearer
    creds = bearer_scheme  # HTTPBearer dependency resolves via FastAPI; call directly:
    from fastapi.security.utils import get_authorization_scheme_param
    auth = request.headers.get("Authorization", "")
    scheme, param = get_authorization_scheme_param(auth)
    if scheme.lower() != "bearer" or not param:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_credentials(
        HTTPAuthorizationCredentials(scheme=scheme, credentials=param)
    )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")
    cur = await db.execute(
        "SELECT id, email, full_name, role, tunnel_token, custom_domain, plan, seats, plan_expires_at, is_active "
        "FROM users WHERE id = %s",
        (user_id,),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if not row[9]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    plan, sponsored_by = await _resolve_seat_plan(db, row[1], row[6] or "free")
    return {
        "id": str(row[0]), "email": row[1], "full_name": row[2], "role": row[3],
        "tunnel_token": row[4], "custom_domain": row[5], "plan": plan,
        "seats": int(row[7] or 1), "plan_expires_at": row[8].isoformat() if row[8] else None, "is_active": row[9],
        "sponsored_by": sponsored_by,
    }


# Re-export get_db for convenience
__all__ = ["bearer_scheme", "get_current_user_id", "get_current_user", "get_admin_user", "get_db"]