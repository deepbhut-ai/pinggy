"""Users router: list/get/update/delete (admin-only)."""
import secrets as _secrets

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection

from app.core.db import get_db
from app.core.deps import get_admin_user, get_current_user
from app.core.security import hash_password
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
        "SELECT id, email, full_name, role, tunnel_token, custom_domain FROM users ORDER BY created_at DESC LIMIT %s OFFSET %s",
        (limit, offset),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [UserOut(id=str(r[0]), email=r[1], full_name=r[2], role=r[3], tunnel_token=r[4], custom_domain=r[5]) for r in rows]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "SELECT id, email, full_name, role, tunnel_token, custom_domain FROM users WHERE id = %s", (user_id,)
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return UserOut(id=str(row[0]), email=row[1], full_name=row[2], role=row[3], tunnel_token=row[4], custom_domain=row[5])


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    email: str | None = None,
    full_name: str | None = None,
    role: str | None = None,
    password: str | None = None,
    custom_domain: str | None = None,
):
    """Update a user (admin only). Can change email, name, role, password, or custom domain."""
    # Check user exists
    cur = await db.execute("SELECT id FROM users WHERE id = %s", (user_id,))
    if not await cur.fetchone():
        await cur.close()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await cur.close()

    # Build update query dynamically
    updates = []
    params = []
    if email:
        updates.append("email = %s")
        params.append(email)
    if full_name:
        updates.append("full_name = %s")
        params.append(full_name)
    if role and role in ("admin", "user"):
        updates.append("role = %s")
        params.append(role)
    if password:
        updates.append("password_hash = %s")
        params.append(hash_password(password))
    if custom_domain is not None:
        updates.append("custom_domain = %s")
        params.append(custom_domain if custom_domain else None)

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    params.append(user_id)
    cur = await db.execute(
        f"UPDATE users SET {', '.join(updates)} WHERE id = %s "
        f"RETURNING id, email, full_name, role, tunnel_token, custom_domain",
        tuple(params),
    )
    row = await cur.fetchone()
    await cur.close()
    return UserOut(id=str(row[0]), email=row[1], full_name=row[2], role=row[3], tunnel_token=row[4], custom_domain=row[5])


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete a user (admin only). Cannot delete yourself."""
    if user_id == admin["id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete your own account")

    cur = await db.execute("SELECT email FROM users WHERE id = %s", (user_id,))
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # Delete user's tunnels from DB
    cur = await db.execute("DELETE FROM tunnels WHERE user_email = %s", (row[0],))
    await cur.close()

    # Delete user
    cur = await db.execute("DELETE FROM users WHERE id = %s", (user_id,))
    await cur.close()

    return {"message": f"User {row[0]} deleted"}


@router.get("/{user_id}/tunnels")
async def get_user_tunnels(
    user_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get all tunnels for a specific user (admin only)."""
    # Get user email
    cur = await db.execute("SELECT email FROM users WHERE id = %s", (user_id,))
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # Get tunnels from DB
    cur = await db.execute(
        "SELECT tunnel_id, subdomain, remote_port, local_port, protocol, "
        "user_email, ssh_peer, status, request_count, bytes_transferred, created_at "
        "FROM tunnels WHERE user_email = %s ORDER BY created_at DESC",
        (row[0],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        {
            "tunnel_id": r[0],
            "subdomain": r[1],
            "url": f"https://{r[1]}.invitechsg.com" if r[1] else "",
            "remote_port": r[2],
            "local_port": r[3],
            "protocol": r[4],
            "user_email": r[5] or "",
            "ssh_peer": r[6] or "",
            "status": r[7],
            "request_count": r[8],
            "bytes_transferred": r[9],
            "created_at": r[10].isoformat() if r[10] else "",
        }
        for r in rows
    ]