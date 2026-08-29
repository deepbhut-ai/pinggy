"""Plans router — public pricing + admin CRUD (Job 1)."""
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user

router = APIRouter(prefix="/plans", tags=["plans"])

_COLS = "id, name, price_inr, price_usd, tagline, features, cta_label, popular, active, sort_order"


def _row(r) -> dict:
    return {
        "id": r[0], "name": r[1], "price_inr": float(r[2]), "price_usd": float(r[3]),
        "tagline": r[4], "features": (r[5] or "").split("\n") if r[5] else [],
        "cta_label": r[6], "popular": r[7], "active": r[8], "sort_order": r[9],
    }


@router.get("")
async def list_plans(
    db: AsyncConnection = Depends(get_db),
    include_inactive: bool = False,
):
    """Public pricing (active plans). Admins may pass include_inactive=true."""
    q = f"SELECT {_COLS} FROM plans"
    if not include_inactive:
        q += " WHERE active"
    q += " ORDER BY sort_order"
    cur = await db.execute(q)
    rows = await cur.fetchall()
    await cur.close()
    return [_row(r) for r in rows]


class PlanUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=50)
    price_inr: float | None = Field(default=None, ge=0)
    price_usd: float | None = Field(default=None, ge=0)
    tagline: str | None = Field(default=None, max_length=200)
    features: list[str] | None = None
    cta_label: str | None = Field(default=None, max_length=50)
    popular: bool | None = None
    active: bool | None = None
    sort_order: int | None = None


@router.put("/{plan_id}")
async def update_plan(
    plan_id: str,
    body: PlanUpdate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    updates, params = [], []
    for field, col in [("name", "name"), ("price_inr", "price_inr"), ("price_usd", "price_usd"),
                       ("tagline", "tagline"), ("cta_label", "cta_label"),
                       ("popular", "popular"), ("active", "active"), ("sort_order", "sort_order")]:
        v = getattr(body, field)
        if v is not None:
            updates.append(f"{col} = %s")
            params.append(v)
    if body.features is not None:
        updates.append("features = %s")
        params.append("\n".join(f for f in body.features if f.strip()))
    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")
    updates.append("updated_at = now()")
    params.append(plan_id)
    cur = await db.execute(
        f"UPDATE plans SET {', '.join(updates)} WHERE id = %s RETURNING {_COLS}",
        tuple(params),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    await log_audit(db, admin["email"], "plan.update", plan_id, ", ".join(updates))
    return _row(row)
