"""FastAPI dependencies for auth."""
from fastapi import Depends, HTTPException, status
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


# Re-export get_db for convenience
__all__ = ["bearer_scheme", "get_current_user_id", "get_current_user", "get_admin_user", "get_db"]