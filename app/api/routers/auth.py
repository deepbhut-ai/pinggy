"""Auth router: register, login, me, 2FA (email OTP)."""
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection
from pydantic import BaseModel

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

    # Also create a token in the multi-token table so the dashboard
    # Quickstart / Manage Tokens shows it immediately (v1.7.0 tokens table).
    cur = await db.execute(
        "INSERT INTO tokens (user_email, token, name) VALUES (%s, %s, %s) "
        "RETURNING id",
        (row[1], tunnel_token, "Default Token"),
    )
    await cur.fetchone()
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


@router.post("/login")
async def login(payload: UserLogin, db: AsyncConnection = Depends(get_db)):
    cur = await db.execute(
        "SELECT id, email, password_hash, full_name, role, tunnel_token, is_active, "
        "COALESCE(twofa_enabled, FALSE) FROM users WHERE email = %s",
        (payload.email,),
    )
    row = await cur.fetchone()
    await cur.close()

    if not row or not verify_password(payload.password, row[2]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not row[6]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled. Contact the administrator.")

    # ---- 2FA (v1.5.0): password OK + 2FA on → issue OTP challenge ----
    if row[7]:
        import secrets as _secrets
        from app.core.redis import get_redis
        code = f"{_secrets.randbelow(1000000):06d}"
        challenge = _secrets.token_hex(16)
        r = get_redis()
        if r is not None:
            import hashlib as _h
            await r.setex(f"otp:{challenge}", 300, _h.sha256(code.encode()).hexdigest() + ":" + row[1])
        else:
            # no Redis: store code itself (single-process dev fallback), still hashed with fixed salt
            import hashlib as _h
            _OTP_FALLBACK[challenge] = (_h.sha256(code.encode()).hexdigest() + ":" + row[1], 300)
        try:
            from app.core.email import send_email
            await send_email(
                db, row[1],
                f"IRAGT verification code: {code}",
                f"Your IRAGT login verification code is: {code}\n\n"
                "It expires in 5 minutes. If you didn't try to log in, reset your password immediately.",
                kind="otp",
            )
        except Exception:
            pass
        from app.core.audit import log_audit
        await log_audit(db, row[1], "auth.otp_challenge", row[1], "2FA code sent")
        return {"otp_required": True, "challenge": challenge}

    user = UserOut(id=str(row[0]), email=row[1], full_name=row[3], role=row[4], tunnel_token=row[5], is_active=row[6])
    token = create_access_token(subject=user.id, extra={"email": user.email, "role": user.role})
    from app.core.audit import log_audit
    await log_audit(db, user.email, "auth.login", user.email, "password login")
    # Login alert email (v1.3.0) — best-effort
    try:
        from app.core.email import send_email
        await send_email(
            db, user.email,
            "New login to your IRAGT account",
            "Hi,\n\nA successful login to your IRAGT account just occurred.\n"
            "If this wasn't you, reset your password immediately from the login page.\n"
            "\nTip: enable Two-Factor Authentication from your dashboard for extra security.",
            kind="login",
        )
    except Exception:
        pass
    return Token(access_token=token, user=user, tunnel_token=row[5])


# no-Redis dev fallback store: challenge -> (hash:email, ttl_s)
_OTP_FALLBACK: dict = {}


class OTPVerify(BaseModel):
    challenge: str
    code: str


async def _consume_otp(challenge: str, code: str) -> str | None:
    """Return email if code matches; consume the challenge either way."""
    import hashlib as _h
    provided = _h.sha256(code.strip().encode()).hexdigest()
    from app.core.redis import get_redis
    r = get_redis()
    if r is not None:
        val = await r.get(f"otp:{challenge}")
        if val is None:
            return None
        val = val.decode() if isinstance(val, bytes) else val
        await r.delete(f"otp:{challenge}")
        expected, email = val.split(":", 1)
        return email if provided == expected else None
    entry = _OTP_FALLBACK.pop(challenge, None)
    if not entry:
        return None
    expected, email = entry[0].split(":", 1)
    return email if provided == expected else None


@router.post("/verify-otp", response_model=Token)
async def verify_otp(payload: OTPVerify, db: AsyncConnection = Depends(get_db)):
    email = await _consume_otp(payload.challenge, payload.code)
    if not email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired verification code")
    cur = await db.execute(
        "SELECT id, email, full_name, role, tunnel_token, is_active FROM users WHERE email = %s",
        (email,),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row or not row[5]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    user = UserOut(id=str(row[0]), email=row[1], full_name=row[2], role=row[3], tunnel_token=row[4], is_active=row[5])
    token = create_access_token(subject=user.id, extra={"email": user.email, "role": user.role})
    from app.core.audit import log_audit
    await log_audit(db, user.email, "auth.login", user.email, "password + OTP login")
    try:
        from app.core.email import send_email
        await send_email(
            db, user.email,
            "New login to your IRAGT account",
            "Hi,\n\nA successful login to your IRAGT account just occurred (two-factor verified).\n"
            "If this wasn't you, reset your password immediately.",
            kind="login",
        )
    except Exception:
        pass
    return Token(access_token=token, user=user, tunnel_token=row[4])


class RefreshIn(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=Token)
async def refresh_access_token(payload: RefreshIn, db: AsyncConnection = Depends(get_db)):
    """v1.11.0 — exchange a valid refresh token for a new access token."""
    from app.core.security import decode_token
    try:
        data = decode_token(payload.refresh_token)
    except HTTPException:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")
    if data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not a refresh token")
    user_id = data.get("sub")
    cur = await db.execute(
        "SELECT id, email, full_name, role, tunnel_token, is_active FROM users WHERE id = %s",
        (user_id,),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row or not row[5]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    user = UserOut(id=str(row[0]), email=row[1], full_name=row[2], role=row[3], tunnel_token=row[4], is_active=row[5])
    token = create_access_token(subject=user.id, extra={"email": user.email, "role": user.role})
    return Token(access_token=token, user=user, tunnel_token=row[4])


@router.get("/2fa")
async def get_2fa(user: dict = Depends(get_current_user), db: AsyncConnection = Depends(get_db)):
    cur = await db.execute("SELECT COALESCE(twofa_enabled, FALSE) FROM users WHERE id = %s", (user["id"],))
    row = await cur.fetchone()
    await cur.close()
    return {"twofa_enabled": bool(row[0]) if row else False}


class TwoFAIn(BaseModel):
    enabled: bool


@router.put("/2fa")
async def set_2fa(payload: TwoFAIn, user: dict = Depends(get_current_user), db: AsyncConnection = Depends(get_db)):
    cur = await db.execute(
        "UPDATE users SET twofa_enabled = %s WHERE id = %s RETURNING twofa_enabled",
        (payload.enabled, user["id"]),
    )
    row = await cur.fetchone()
    await cur.close()
    from app.core.audit import log_audit
    await log_audit(db, user["email"], "auth.2fa", user["email"], f"2FA {'enabled' if payload.enabled else 'disabled'}")
    return {"twofa_enabled": bool(row[0])}


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