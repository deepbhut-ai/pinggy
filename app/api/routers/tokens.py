"""Token management router — CRUD for tunnel tokens.

Each user can have multiple tokens, each creating a separate tunnel
with its own subdomain and optional custom domain.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.db import get_db
from app.core.deps import get_admin_user, get_current_user

router = APIRouter(prefix="/tokens", tags=["tokens"])


class TokenOut(BaseModel):
    id: str
    token: str
    name: str | None = None
    custom_domain: str | None = None
    subdomain: str | None = None
    created_at: str | None = None
    total_requests: int = 0
    total_bytes: int = 0
    active_tunnels: int = 0
    fixed_subdomain: str | None = None
    security: dict | None = None  # masked security view (never returns basic_auth_pass / full bearer when set)


async def _token_traffic(db: AsyncConnection, token: str) -> tuple[int, int, int]:
    """Aggregate (total_requests, total_bytes, active_tunnels) for one token's tunnels."""
    cur = await db.execute(
        "SELECT COALESCE(SUM(request_count),0), COALESCE(SUM(bytes_transferred),0), "
        "COUNT(*) FILTER (WHERE status = 'active') "
        "FROM tunnels WHERE token = %s",
        (token,),
    )
    row = await cur.fetchone()
    await cur.close()
    return int(row[0]), int(row[1]), int(row[2])


class TokenCreate(BaseModel):
    name: str = Field(default="New Token", max_length=120)
    custom_domain: str | None = Field(default=None, max_length=255)


class TokenUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    custom_domain: str | None = None
    fixed_subdomain: str | None = Field(default=None, max_length=50)
    basic_auth_user: str | None = Field(default=None, max_length=120)
    basic_auth_pass: str | None = Field(default=None, max_length=120)
    ip_whitelist: str | None = None
    bearer_key: str | None = Field(default=None, max_length=64)
    https_only: bool | None = None


def _generate_token() -> str:
    return secrets.token_hex(8)  # 16-char hex string


def _subdomain_from_token(token: str) -> str:
    import hashlib
    return hashlib.md5(token.encode()).hexdigest()[:7]


def _validate_custom_domain(domain: str, user: dict) -> str:
    """Validate and normalize a custom domain.

    Only admin and support@iraglobaltech.com can use *.iraglobaltech.com subdomains.
    """
    cd = domain.strip().lower()
    # Restrict *.iraglobaltech.com to admin and support only
    if cd.endswith(".iraglobaltech.com") or cd == "iraglobaltech.com":
        allowed = user.get("role") == "admin" or user.get("email") == "support@iraglobaltech.com"
        if not allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Subdomains of iraglobaltech.com can only be set by admin or support@iraglobaltech.com.",
            )
    return cd


@router.get("", response_model=list[TokenOut])
async def list_tokens(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all tokens for the current user."""
    cur = await db.execute(
        "SELECT id, token, name, custom_domain, created_at, basic_auth_user, ip_whitelist, bearer_key, https_only, fixed_subdomain FROM tokens WHERE user_email = %s ORDER BY created_at DESC",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    out = []
    for r in rows:
        req, byt, act = await _token_traffic(db, r[1])
        out.append(TokenOut(
            id=str(r[0]),
            token=r[1],
            name=r[2],
            custom_domain=r[3],
            subdomain=r[9] or _subdomain_from_token(r[1]),
            created_at=r[4].isoformat() if r[4] else None,
            total_requests=req,
            total_bytes=byt,
            active_tunnels=act,
            fixed_subdomain=r[9],
            security={
                "basic_auth_user": r[5],
                "ip_whitelist": r[6],
                "bearer_key": "***set***" if r[7] else None,
                "https_only": r[8],
            },
        ))
    return out


@router.post("", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def create_token(
    body: TokenCreate,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a new token for the current user.
    Free plan is limited to 1 token (single tunnel).
    Pro users can set a custom_domain at creation time."""
    # Plan limit check
    if (user.get("plan") or "free") != "pro":
        cur = await db.execute(
            "SELECT COUNT(*) FROM tokens WHERE user_email = %s", (user["email"],)
        )
        row = await cur.fetchone()
        await cur.close()
        if row[0] >= 1:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                "Free plan allows only 1 tunnel token. Upgrade to Pro to create more.",
            )

    # Validate custom_domain uniqueness if provided
    custom_domain = None
    if body.custom_domain:
        cd = _validate_custom_domain(body.custom_domain, user)
        if cd:
            cur = await db.execute(
                "SELECT id FROM tokens WHERE custom_domain = %s", (cd,)
            )
            if await cur.fetchone():
                await cur.close()
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Domain '{cd}' is already in use by another token.",
                )
            await cur.close()
            custom_domain = cd

    token = _generate_token()
    cur = await db.execute(
        "INSERT INTO tokens (user_email, token, name, custom_domain) "
        "VALUES (%s, %s, %s, %s) "
        "RETURNING id, token, name, custom_domain, created_at",
        (user["email"], token, body.name, custom_domain),
    )
    row = await cur.fetchone()
    await cur.close()
    return TokenOut(
        id=str(row[0]),
        token=row[1],
        name=row[2],
        custom_domain=row[3],
        subdomain=_subdomain_from_token(row[1]),
        created_at=row[4].isoformat() if row[4] else None,
    )


@router.put("/{token_id}", response_model=TokenOut)
async def update_token(
    token_id: str,
    body: TokenUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update a token's name, custom domain, or security options (v0.8.0)."""
    # Verify ownership
    cur = await db.execute(
        "SELECT id FROM tokens WHERE id = %s AND user_email = %s",
        (token_id, user["email"]),
    )
    if not await cur.fetchone():
        await cur.close()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    await cur.close()

    updates = []
    params = []
    if body.name is not None:
        updates.append("name = %s")
        params.append(body.name)
    if body.custom_domain is not None:
        domain_value = body.custom_domain.strip() if body.custom_domain else None
        # Check if domain is already taken by another token
        if domain_value:
            domain_value = _validate_custom_domain(domain_value, user)
            cur = await db.execute(
                "SELECT id FROM tokens WHERE custom_domain = %s AND id != %s",
                (domain_value, token_id),
            )
            if await cur.fetchone():
                await cur.close()
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Domain '{domain_value}' is already in use by another token.",
                )
            await cur.close()
        updates.append("custom_domain = %s")
        params.append(domain_value)
    # ---- fixed subdomain (v0.9.0): stable URL per token ----
    if body.fixed_subdomain is not None:
        import re as _re
        sub = body.fixed_subdomain.strip().lower() or None
        if sub:
            if not _re.fullmatch(r"[a-z0-9][a-z0-9-]{2,49}", sub):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "Subdomain must be 3-50 chars: letters, digits, hyphens (no leading hyphen).",
                )
            cur = await db.execute(
                "SELECT id FROM tokens WHERE fixed_subdomain = %s AND id != %s",
                (sub, token_id),
            )
            if await cur.fetchone():
                await cur.close()
                raise HTTPException(status.HTTP_409_CONFLICT, f"Subdomain '{sub}' is already taken.")
            await cur.close()
        updates.append("fixed_subdomain = %s")
        params.append(sub)
    # ---- security options (v0.8.0): empty string clears a setting ----
    import secrets as _secrets
    sec_changed = []
    if body.basic_auth_user is not None:
        u = body.basic_auth_user.strip() or None
        if u and not body.basic_auth_pass:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "basic_auth_pass required when setting basic_auth_user")
        updates.append("basic_auth_user = %s"); params.append(u)
        sec_changed.append("basic_auth" if u else "basic_auth=off")
    if body.basic_auth_pass is not None:
        updates.append("basic_auth_pass = %s"); params.append(body.basic_auth_pass.strip() or None)
    if body.ip_whitelist is not None:
        wl = ",".join(s.strip() for s in body.ip_whitelist.split(",") if s.strip()) or None
        updates.append("ip_whitelist = %s"); params.append(wl)
        sec_changed.append(f"ip_whitelist({len(wl.split(',')) if wl else 0})")
    if body.bearer_key is not None:
        bk = body.bearer_key.strip() or None
        if bk == "auto":
            bk = _secrets.token_hex(16)
        updates.append("bearer_key = %s"); params.append(bk)
        sec_changed.append("bearer_key" if bk else "bearer_key=off")
    if body.https_only is not None:
        updates.append("https_only = %s"); params.append(body.https_only)
        sec_changed.append(f"https_only={body.https_only}")

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    params.append(token_id)
    try:
        cur = await db.execute(
            f"UPDATE tokens SET {', '.join(updates)}, updated_at = now() WHERE id = %s "
            f"RETURNING id, token, name, custom_domain, created_at, fixed_subdomain",
            tuple(params),
        )
        row = await cur.fetchone()
        await cur.close()
        if sec_changed:
            from app.core.audit import log_audit
            await log_audit(db, user["email"], "token.security", row[1], ", ".join(sec_changed))
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This custom domain or subdomain is already in use.",
            )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

    return TokenOut(
        id=str(row[0]),
        token=row[1],
        name=row[2],
        custom_domain=row[3],
        subdomain=row[5] or _subdomain_from_token(row[1]),
        created_at=row[4].isoformat() if row[4] else None,
        fixed_subdomain=row[5],
    )


@router.delete("/{token_id}", status_code=status.HTTP_200_OK)
async def delete_token(
    token_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete a token."""
    cur = await db.execute(
        "DELETE FROM tokens WHERE id = %s AND user_email = %s RETURNING token",
        (token_id, user["email"]),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    return {"message": "Token deleted"}


@router.post("/{token_id}/regenerate", response_model=TokenOut)
async def regenerate_token(
    token_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Regenerate the token string (old token stops working)."""
    new_token = _generate_token()
    try:
        cur = await db.execute(
            "UPDATE tokens SET token = %s, updated_at = now() WHERE id = %s AND user_email = %s "
            "RETURNING id, token, name, custom_domain, created_at",
            (new_token, token_id, user["email"]),
        )
        row = await cur.fetchone()
        await cur.close()
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")

    return TokenOut(
        id=str(row[0]),
        token=row[1],
        name=row[2],
        custom_domain=row[3],
        subdomain=_subdomain_from_token(row[1]),
        created_at=row[4].isoformat() if row[4] else None,
    )


# ================================================================
# Admin endpoints — admin-only, operate across ALL users
# ================================================================

class AdminTokenOut(BaseModel):
    id: str
    token: str
    name: str | None = None
    custom_domain: str | None = None
    subdomain: str | None = None
    user_email: str
    created_at: str | None = None
    total_requests: int = 0
    total_bytes: int = 0
    active_tunnels: int = 0


@router.get("/admin/all", response_model=list[AdminTokenOut])
async def admin_list_all_tokens(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = 200,
):
    """List all tokens across all users (admin only)."""
    cur = await db.execute(
        "SELECT id, token, name, custom_domain, user_email, created_at "
        "FROM tokens ORDER BY created_at DESC LIMIT %s",
        (limit,),
    )
    rows = await cur.fetchall()
    await cur.close()
    out = []
    for r in rows:
        req, byt, act = await _token_traffic(db, r[1])
        out.append(AdminTokenOut(
            id=str(r[0]),
            token=r[1],
            name=r[2],
            custom_domain=r[3],
            subdomain=_subdomain_from_token(r[1]),
            user_email=r[4],
            created_at=r[5].isoformat() if r[5] else None,
            total_requests=req,
            total_bytes=byt,
            active_tunnels=act,
        ))
    return out


@router.delete("/admin/{token_id}", status_code=status.HTTP_200_OK)
async def admin_delete_token(
    token_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete any token by ID (admin only)."""
    cur = await db.execute(
        "DELETE FROM tokens WHERE id = %s RETURNING token", (token_id,)
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    return {"message": "Token deleted"}


@router.post("/admin/{token_id}/regenerate", response_model=AdminTokenOut)
async def admin_regenerate_token(
    token_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Regenerate any token's string (admin only)."""
    new_token = _generate_token()
    cur = await db.execute(
        "UPDATE tokens SET token = %s, updated_at = now() WHERE id = %s "
        "RETURNING id, token, name, custom_domain, user_email, created_at",
        (new_token, token_id),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    return AdminTokenOut(
        id=str(row[0]),
        token=row[1],
        name=row[2],
        custom_domain=row[3],
        subdomain=_subdomain_from_token(row[1]),
        user_email=row[4],
        created_at=row[5].isoformat() if row[5] else None,
    )