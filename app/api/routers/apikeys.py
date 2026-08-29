"""API keys router — create/list/revoke programmatic access keys.

Auth model: the raw key is shown exactly once at creation (pk_live_...-style).
Only its SHA-256 hash is stored. Keys authenticate via X-Api-Key header on the
management REST endpoints (tunnels/tokens/domains read-write).
"""
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_current_user

router = APIRouter(prefix="/apikeys", tags=["apikeys"])


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def resolve_api_key(db: AsyncConnection, raw: str) -> str | None:
    """Return the owner email if the raw key is valid, else None. Updates last_used."""
    h = _hash_key(raw)
    cur = await db.execute(
        "SELECT user_email FROM api_keys WHERE key_hash = %s", (h,)
    )
    row = await cur.fetchone()
    await cur.close()
    if row:
        cur = await db.execute("UPDATE api_keys SET last_used_at = now() WHERE key_hash = %s", (h,))
        await cur.close()
        return row[0]
    return None


class ApiKeyOut(BaseModel):
    id: str
    name: str
    prefix: str
    created_at: str | None = None
    last_used_at: str | None = None


class ApiKeyCreated(ApiKeyOut):
    key: str  # raw key — shown once


@router.get("", response_model=list[ApiKeyOut])
async def list_api_keys(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "SELECT id, name, prefix, created_at, last_used_at FROM api_keys "
        "WHERE user_email = %s ORDER BY created_at DESC",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        ApiKeyOut(id=str(r[0]), name=r[1], prefix=r[2],
                  created_at=r[3].isoformat() if r[3] else None,
                  last_used_at=r[4].isoformat() if r[4] else None)
        for r in rows
    ]


class ApiKeyIn(BaseModel):
    name: str = Field(max_length=120)


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: ApiKeyIn,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    raw = "pk_" + secrets.token_urlsafe(32)
    cur = await db.execute(
        """INSERT INTO api_keys (user_email, name, key_hash, prefix)
           VALUES (%s, %s, %s, %s) RETURNING id, name, prefix, created_at""",
        (user["email"], body.name, _hash_key(raw), raw[:8]),
    )
    r = await cur.fetchone()
    await cur.close()
    await log_audit(db, user["email"], "apikey.create", body.name, f"prefix={raw[:8]}")
    return ApiKeyCreated(
        id=str(r[0]), name=r[1], prefix=r[2],
        created_at=r[3].isoformat() if r[3] else None,
        key=raw,
    )


@router.delete("/{key_id}", status_code=status.HTTP_200_OK)
async def revoke_api_key(
    key_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "DELETE FROM api_keys WHERE id = %s AND user_email = %s RETURNING name",
        (key_id, user["email"]),
    )
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found")
    await log_audit(db, user["email"], "apikey.revoke", r[0], "revoked")
    return {"message": "API key revoked"}
