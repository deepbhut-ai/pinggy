"""Settings + Coupons router — runtime app configuration (admin only) and promo codes."""
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.app_settings import SETTING_DEFS, get_setting, set_setting
from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user

router = APIRouter(prefix="/settings", tags=["settings"])


def _mask(value) -> str:
    if value in (None, ""):
        return ""
    s = str(value)
    if len(s) <= 6:
        return "••••"
    return s[:3] + "••••" + s[-3:]


@router.get("")
async def get_settings_view(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """All managed settings with masked secrets + source (db override vs env default)."""
    out = []
    for key, is_secret, _env_attr, label in SETTING_DEFS:
        raw = await get_setting(db, key)
        # determine source: db row present?
        cur = await db.execute("SELECT 1 FROM app_settings WHERE key = %s", (key,))
        in_db = await cur.fetchone() is not None
        await cur.close()
        shown = _mask(raw) if is_secret else ("" if raw is None else str(raw))
        out.append({
            "key": key,
            "label": label,
            "is_secret": is_secret,
            "value": shown,          # masked for secrets
            "is_set": bool(raw not in (None, "")),
            "source": "db" if in_db else "env",
        })
    return out


class SettingsUpdate(BaseModel):
    values: dict[str, str] = Field(min_length=1)


@router.put("")
async def update_settings(
    body: SettingsUpdate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update one or more settings. Secrets are only written when a non-empty
    value is supplied (send "" to clear)."""
    valid_keys = {k for k, _s, _e, _l in SETTING_DEFS}
    changed = []
    for key, value in body.values.items():
        if key not in valid_keys:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown setting: {key}")
        await set_setting(db, key, value, updated_by=admin["email"])
        changed.append(key if not any(k == key and s for k, s, _e, _l in SETTING_DEFS) else f"{key}=***")
    await log_audit(db, admin["email"], "settings.update", "", ", ".join(changed))
    return {"detail": f"Updated {len(changed)} setting(s)", "changed": changed}


# ================================================================ Coupons
class CouponOut(BaseModel):
    id: str
    code: str
    percent_off: int
    max_redemptions: int
    redeemed: int
    active: bool
    expires_at: str | None = None
    created_at: str | None = None


class CouponCreate(BaseModel):
    code: str | None = Field(default=None, max_length=32)
    percent_off: int = Field(ge=1, le=100)
    max_redemptions: int = Field(default=0, ge=0)
    expires_at: str | None = None


def _coupon_out(r) -> CouponOut:
    return CouponOut(
        id=str(r[0]), code=r[1], percent_off=r[2], max_redemptions=r[3],
        redeemed=r[4], active=r[5],
        expires_at=r[6].isoformat() if r[6] else None,
        created_at=r[7].isoformat() if r[7] else None,
    )

_COUPON_COLS = ("id, code, percent_off, max_redemptions, redeemed, active, expires_at, created_at")


@router.get("/coupons", response_model=list[CouponOut])
async def list_coupons(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(f"SELECT {_COUPON_COLS} FROM coupons ORDER BY created_at DESC")
    rows = await cur.fetchall()
    await cur.close()
    return [_coupon_out(r) for r in rows]


@router.post("/coupons", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
async def create_coupon(
    body: CouponCreate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    code = (body.code or "").strip().upper() or secrets.token_hex(4).upper()
    cur = await db.execute(
        f"INSERT INTO coupons (code, percent_off, max_redemptions, expires_at) "
        f"VALUES (%s, %s, %s, %s) RETURNING {_COUPON_COLS}",
        (code, body.percent_off, body.max_redemptions, body.expires_at or None),
    )
    row = await cur.fetchone()
    await cur.close()
    await log_audit(db, admin["email"], "coupon.create", code, f"{body.percent_off}% off")
    return _coupon_out(row)


@router.put("/coupons/{coupon_id}", response_model=CouponOut)
async def update_coupon(
    coupon_id: str,
    body: dict,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    updates, params = [], []
    if "active" in body:
        updates.append("active = %s"); params.append(bool(body["active"]))
    if "percent_off" in body:
        v = int(body["percent_off"])
        if not 1 <= v <= 100:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "percent_off must be 1-100")
        updates.append("percent_off = %s"); params.append(v)
    if "max_redemptions" in body:
        updates.append("max_redemptions = %s"); params.append(int(body["max_redemptions"]))
    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")
    params.append(coupon_id)
    cur = await db.execute(
        f"UPDATE coupons SET {', '.join(updates)} WHERE id = %s RETURNING {_COUPON_COLS}",
        tuple(params),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    await log_audit(db, admin["email"], "coupon.update", row[1], ", ".join(updates))
    return _coupon_out(row)


@router.delete("/coupons/{coupon_id}", status_code=status.HTTP_200_OK)
async def delete_coupon(
    coupon_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute("DELETE FROM coupons WHERE id = %s RETURNING code", (coupon_id,))
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    await log_audit(db, admin["email"], "coupon.delete", row[0], "removed")
    return {"message": "Coupon deleted"}


# ================================================================ Public list (for checkout UI hints)
@router.get("/coupons/public")
async def public_list_coupons(
    db: AsyncConnection = Depends(get_db),
):
    """Active, non-expired, non-exhausted coupons (for checkout UI hints)."""
    cur = await db.execute(
        f"SELECT {_COUPON_COLS} FROM coupons "
        f"WHERE active AND (expires_at IS NULL OR expires_at > now()) "
        f"AND (max_redemptions = 0 OR redeemed < max_redemptions) ORDER BY created_at DESC LIMIT 50"
    )
    rows = await cur.fetchall()
    await cur.close()
    return [{"code": r[1], "percent_off": r[2]} for r in rows]
