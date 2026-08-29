"""Auth router: register, login, me."""
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection

from app.core.db import get_db
from app.core.deps import get_admin_user, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.schemas.auth import Token, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserCreate,
    db: AsyncConnection = Depends(get_db),
):
    """Create a new user. Public endpoint — anyone can sign up."""
    # Check existing user
    cur = await db.execute(
        "SELECT id FROM users WHERE email = %s", (payload.email,)
    )
    if await cur.fetchone():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    await cur.close()

    import secrets as _secrets
    tunnel_token = _secrets.token_hex(8)  # 16-char hex token
    hashed = hash_password(payload.password)
    # Force role to "user" for self-service signup (prevent privilege escalation)
    safe_role = "user"
    cur = await db.execute(
        """
        INSERT INTO users (email, password_hash, full_name, role, tunnel_token)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, email, full_name, role, tunnel_token
        """,
        (payload.email, hashed, payload.full_name, safe_role, tunnel_token),
    )
    row = await cur.fetchone()
    await cur.close()

    user = UserOut(id=str(row[0]), email=row[1], full_name=row[2], role=row[3], tunnel_token=row[4])
    token = create_access_token(subject=user.id, extra={"email": user.email, "role": user.role})
    from app.core.audit import log_audit
    await log_audit(db, user.email, "user.register", user.email, "self-service signup")
    # Welcome email (Job 6) — best-effort; logged to email_logs even when SMTP is off
    try:
        from app.core.email import send_template
        from app.core.config import settings as _settings
        await send_template(
            db, user.email, "welcome",
            name=payload.full_name or user.email,
            ssh_port=_settings.SSH_PORT,
            ssh_host=_settings.TUNNEL_DOMAIN.split(":")[0],
        )
    except Exception:
        pass
    return Token(access_token=token, user=user, tunnel_token=row[4])


@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db: AsyncConnection = Depends(get_db)):
    cur = await db.execute(
        "SELECT id, email, password_hash, full_name, role, tunnel_token, is_active FROM users WHERE email = %s",
        (payload.email,),
    )
    row = await cur.fetchone()
    await cur.close()

    if not row or not verify_password(payload.password, row[2]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not row[6]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled. Contact the administrator.")

    user = UserOut(id=str(row[0]), email=row[1], full_name=row[3], role=row[4], tunnel_token=row[5], is_active=row[6])
    token = create_access_token(subject=user.id, extra={"email": user.email, "role": user.role})
    return Token(access_token=token, user=user, tunnel_token=row[5])


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(
        id=user["id"], email=user["email"], full_name=user["full_name"], role=user["role"],
        tunnel_token=user.get("tunnel_token"), custom_domain=user.get("custom_domain"),
        plan=user.get("plan") or "free", is_active=user.get("is_active", True),
    )


@router.get("/tunnel-token")
async def get_tunnel_token(user: dict = Depends(get_current_user), db: AsyncConnection = Depends(get_db)):
    """Get the current user's tunnel token for SSH authentication."""
    cur = await db.execute(
        "SELECT tunnel_token FROM users WHERE id = %s", (user["id"],)
    )
    row = await cur.fetchone()
    await cur.close()
    if not row or not row[0]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tunnel token not found")
    return {"tunnel_token": row[0]}


@router.post("/regenerate-token")
async def regenerate_tunnel_token(user: dict = Depends(get_current_user), db: AsyncConnection = Depends(get_db)):
    """Regenerate the current user's tunnel token (in case of compromise)."""
    import secrets as _secrets
    new_token = _secrets.token_hex(8)
    cur = await db.execute(
        "UPDATE users SET tunnel_token = %s WHERE id = %s RETURNING tunnel_token",
        (new_token, user["id"]),
    )
    row = await cur.fetchone()
    await cur.close()
    return {"tunnel_token": row[0], "message": "Tunnel token regenerated. Use the new token for SSH connections."}


# ================================================================ Password reset (Job 6)
RESET_MINUTES = 30


@router.post("/forgot-password")
async def forgot_password(payload: dict, db: AsyncConnection = Depends(get_db)):
    """Request a reset link. Always returns 200 (no account enumeration)."""
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "email required")
    cur = await db.execute("SELECT id FROM users WHERE email = %s", (email,))
    row = await cur.fetchone()
    await cur.close()
    if row:
        import secrets as _secrets
        import hashlib as _hashlib
        raw = _secrets.token_urlsafe(32)
        token_hash = _hashlib.sha256(raw.encode()).hexdigest()
        from datetime import datetime, timedelta, timezone
        cur = await db.execute(
            "INSERT INTO password_resets (user_email, token_hash, expires_at) VALUES (%s, %s, %s)",
            (email, token_hash, datetime.now(timezone.utc) + timedelta(minutes=RESET_MINUTES)),
        )
        await cur.close()
        from app.core.app_settings import get_setting
        from app.core.email import send_template
        base_url = await get_setting(db, "public_base_url", "")
        await send_template(db, email, "reset", token=raw, minutes=RESET_MINUTES, base_url=base_url or "")
        from app.core.audit import log_audit
        await log_audit(db, email, "auth.forgot_password", email, "reset link requested")
    return {"detail": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(payload: dict, db: AsyncConnection = Depends(get_db)):
    """Complete a reset: {token, new_password}. Token is single-use, 30min TTL."""
    import hashlib as _hashlib
    from datetime import datetime, timezone
    raw = (payload.get("token") or "").strip()
    new_password = payload.get("new_password") or ""
    if not raw or len(new_password) < 4:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "token and new_password (min 4 chars) required")
    token_hash = _hashlib.sha256(raw.encode()).hexdigest()
    cur = await db.execute(
        "SELECT id, user_email, expires_at, used_at FROM password_resets WHERE token_hash = %s",
        (token_hash,),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row or row[3] or row[2] < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token")
    reset_id, email = row[0], row[1]
    cur = await db.execute(
        "UPDATE users SET password_hash = %s, updated_at = now() WHERE email = %s",
        (hash_password(new_password), email),
    )
    await cur.close()
    cur = await db.execute("UPDATE password_resets SET used_at = now() WHERE id = %s", (reset_id,))
    await cur.close()
    from app.core.audit import log_audit
    await log_audit(db, email, "auth.reset_password", email, "password reset via email token")
    return {"detail": "Password updated. You can now log in."}