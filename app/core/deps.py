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
        "SELECT id, email, full_name, role, tunnel_token, custom_domain, plan, plan_expires_at, is_active FROM users WHERE id = %s",
        (user_id,),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if not row[8]:
        # Account disabled by an admin — existing tokens stop working immediately
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    return {
        "id": str(row[0]),
        "email": row[1],
        "full_name": row[2],
        "role": row[3],
        "tunnel_token": row[4],
        "custom_domain": row[5],
        "plan": row[6] or "free",
        "plan_expires_at": row[7].isoformat() if row[7] else None,
        "is_active": row[8],
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
        cur = await db.execute(
            "SELECT id, email, full_name, role, tunnel_token, custom_domain, plan, plan_expires_at, is_active "
            "FROM users WHERE email = %s",
            (email,),
        )
        row = await cur.fetchone()
        await cur.close()
        if not row or not row[8]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
        return {
            "id": str(row[0]), "email": row[1], "full_name": row[2], "role": row[3],
            "tunnel_token": row[4], "custom_domain": row[5], "plan": row[6] or "free",
            "plan_expires_at": row[7].isoformat() if row[7] else None, "is_active": row[8],
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
        "SELECT id, email, full_name, role, tunnel_token, custom_domain, plan, plan_expires_at, is_active "
        "FROM users WHERE id = %s",
        (user_id,),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if not row[8]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    return {
        "id": str(row[0]), "email": row[1], "full_name": row[2], "role": row[3],
        "tunnel_token": row[4], "custom_domain": row[5], "plan": row[6] or "free",
        "plan_expires_at": row[7].isoformat() if row[7] else None, "is_active": row[8],
    }


# Re-export get_db for convenience
__all__ = ["bearer_scheme", "get_current_user_id", "get_current_user", "get_admin_user", "get_db"]