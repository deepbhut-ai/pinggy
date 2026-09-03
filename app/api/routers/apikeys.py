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
from app.core.deps import get_api_user

router = APIRouter(prefix="/apikeys", tags=["apikeys"])


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def resolve_api_key(db: AsyncConnection, raw: str) -> str | None:
    """Return the owner email if the raw key is valid and unexpired, else None. Updates last_used."""
    h = _hash_key(raw)
    cur = await db.execute(
        "SELECT user_email FROM api_keys "
        "WHERE key_hash = %s AND (expires_at IS NULL OR expires_at > now())",
        (h,),
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
    expires_at: str | None = None  # v1.6.0 — None = never expires


class ApiKeyCreated(ApiKeyOut):
    key: str  # raw key — shown once


@router.get("", response_model=list[ApiKeyOut])
async def list_api_keys(
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "SELECT id, name, prefix, created_at, last_used_at, expires_at FROM api_keys "
        "WHERE user_email = %s ORDER BY created_at DESC",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        ApiKeyOut(id=str(r[0]), name=r[1], prefix=r[2],
                  created_at=r[3].isoformat() if r[3] else None,
                  last_used_at=r[4].isoformat() if r[4] else None,
                  expires_at=r[5].isoformat() if r[5] else None)
        for r in rows
    ]


# v1.6.0 — plan-based API key caps
KEY_LIMITS = {"free": 5, "pro": 10}


class ApiKeyIn(BaseModel):
    name: str = Field(max_length=120)
    expiry_days: int | None = None  # 30 | 90 | None (never)


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: ApiKeyIn,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    # v1.6.0 — plan-based cap (expired keys still count; revoke frees a slot)
    limit = KEY_LIMITS.get(user.get("plan") or "free", 5)
    cur = await db.execute("SELECT COUNT(*) FROM api_keys WHERE user_email = %s", (user["email"],))
    count = (await cur.fetchone())[0]
    await cur.close()
    if count >= limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED if user.get("plan") != "pro" else status.HTTP_400_BAD_REQUEST,
            f"API key limit reached ({limit} on the {user.get('plan') or 'free'} plan). "
            "Revoke an unused key or upgrade to Pro for 10 keys.",
        )
    if body.expiry_days not in (None, 30, 90):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "expiry_days must be 30, 90, or null (never)")
    raw = "pk_" + secrets.token_urlsafe(32)
    cur = await db.execute(
        """INSERT INTO api_keys (user_email, name, key_hash, prefix, expires_at)
           VALUES (%s, %s, %s, %s,
                   CASE WHEN %s::int IS NULL THEN NULL ELSE now() + (%s::int || ' days')::interval END)
           RETURNING id, name, prefix, created_at, expires_at""",
        (user["email"], body.name, _hash_key(raw), raw[:8], body.expiry_days, body.expiry_days),
    )
    r = await cur.fetchone()
    await cur.close()
    await log_audit(db, user["email"], "apikey.create", body.name, f"prefix={raw[:8]}")
    # Notification email (v1.3.0) — best-effort; the raw key is NOT emailed (shown once in UI)
    try:
        from app.core.email import send_email
        await send_email(
            db, user["email"],
            "Your IRAGT API key was created",
            f"Hi {user['email']},\n\nAn API key '{body.name}' ({raw[:8]}…) was just created on your IRAGT account.\n"
            "The full key was shown once in your dashboard — copy it from there if you haven't already.\n\n"
            "If this wasn't you, revoke the key immediately under Dashboard → API Keys.",
            kind="apikey",
        )
    except Exception:
        pass
    return ApiKeyCreated(
        id=str(r[0]), name=r[1], prefix=r[2],
        created_at=r[3].isoformat() if r[3] else None,
        key=raw,
    )  # note: expires_at visible in the keys table right after


@router.delete("/{key_id}", status_code=status.HTTP_200_OK)
async def revoke_api_key(
    key_id: str,
    user: dict = Depends(get_api_user),
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
