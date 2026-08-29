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


class TokenCreate(BaseModel):
    name: str = Field(default="New Token", max_length=120)
    custom_domain: str | None = Field(default=None, max_length=255)


class TokenUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    custom_domain: str | None = None


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
        "SELECT id, token, name, custom_domain, created_at FROM tokens WHERE user_email = %s ORDER BY created_at DESC",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        TokenOut(
            id=str(r[0]),
            token=r[1],
            name=r[2],
            custom_domain=r[3],
            subdomain=_subdomain_from_token(r[1]),
            created_at=r[4].isoformat() if r[4] else None,
        )
        for r in rows
    ]


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
    """Update a token's name or custom domain."""
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

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    params.append(token_id)
    try:
        cur = await db.execute(
            f"UPDATE tokens SET {', '.join(updates)}, updated_at = now() WHERE id = %s "
            f"RETURNING id, token, name, custom_domain, created_at",
            tuple(params),
        )
        row = await cur.fetchone()
        await cur.close()
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This custom domain is already in use.",
            )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

    return TokenOut(
        id=str(row[0]),
        token=row[1],
        name=row[2],
        custom_domain=row[3],
        subdomain=_subdomain_from_token(row[1]),
        created_at=row[4].isoformat() if row[4] else None,
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
    return [
        AdminTokenOut(
            id=str(r[0]),
            token=r[1],
            name=r[2],
            custom_domain=r[3],
            subdomain=_subdomain_from_token(r[1]),
            user_email=r[4],
            created_at=r[5].isoformat() if r[5] else None,
        )
        for r in rows
    ]


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