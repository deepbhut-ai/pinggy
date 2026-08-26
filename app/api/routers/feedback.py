"""Feedback / feature request endpoint."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.db import get_conn
from app.core.deps import get_current_user

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeatureRequest(BaseModel):
    email: str | None = None
    title: str
    category: str
    description: str


@router.post("/feature")
async def submit_feature(payload: FeatureRequest, user=Depends(get_current_user)):
    """Store a feature request. Falls back to anonymous if token missing."""
    email = (user.get("email") if user else None) or payload.email or "anonymous"
    async with get_conn() as conn:
        cur = await conn.execute(
            """
            INSERT INTO feature_requests (email, title, category, description)
            VALUES (%s, %s, %s, %s)
            """,
            (email, payload.title, payload.category, payload.description),
        )
        await cur.close()
    return {"ok": True}
