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
    admin: dict = Depends(get_admin_user),
):
    """Create a new user. Admin-only — requires admin JWT token."""
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
    cur = await db.execute(
        """
        INSERT INTO users (email, password_hash, full_name, role, tunnel_token)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, email, full_name, role, tunnel_token
        """,
        (payload.email, hashed, payload.full_name, payload.role, tunnel_token),
    )
    row = await cur.fetchone()
    await cur.close()

    user = UserOut(id=str(row[0]), email=row[1], full_name=row[2], role=row[3], tunnel_token=row[4])
    token = create_access_token(subject=user.id, extra={"email": user.email, "role": user.role})
    return Token(access_token=token, user=user, tunnel_token=row[4])


@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db: AsyncConnection = Depends(get_db)):
    cur = await db.execute(
        "SELECT id, email, password_hash, full_name, role, tunnel_token FROM users WHERE email = %s",
        (payload.email,),
    )
    row = await cur.fetchone()
    await cur.close()

    if not row or not verify_password(payload.password, row[2]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    user = UserOut(id=str(row[0]), email=row[1], full_name=row[3], role=row[4], tunnel_token=row[5])
    token = create_access_token(subject=user.id, extra={"email": user.email, "role": user.role})
    return Token(access_token=token, user=user, tunnel_token=row[5])


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(
        id=user["id"], email=user["email"], full_name=user["full_name"], role=user["role"],
        tunnel_token=user.get("tunnel_token"), custom_domain=user.get("custom_domain"),
        plan=user.get("plan") or "free",
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