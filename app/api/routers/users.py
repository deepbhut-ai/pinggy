"""Users router: list/get (admin-only)."""
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection

from app.core.db import get_db
from app.core.deps import get_admin_user
from app.schemas.auth import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    cur = await db.execute(
        "SELECT id, email, full_name, role FROM users ORDER BY created_at DESC LIMIT %s OFFSET %s",
        (limit, offset),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [UserOut(id=str(r[0]), email=r[1], full_name=r[2], role=r[3]) for r in rows]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "SELECT id, email, full_name, role FROM users WHERE id = %s", (user_id,)
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return UserOut(id=str(row[0]), email=row[1], full_name=row[2], role=row[3])