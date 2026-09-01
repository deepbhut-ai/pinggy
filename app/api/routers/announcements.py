"""Announcements + email campaigns + email logs (admin) — Job 6."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user, get_current_user
from app.core.email import send_email, smtp_configured

router = APIRouter(prefix="/announcements", tags=["announcements"])


class AnnouncementOut(BaseModel):
    id: str
    title: str
    body: str
    level: str
    active: bool
    created_at: str | None = None


_COLS = "id, title, body, level, active, created_at"


@router.get("", response_model=list[AnnouncementOut])
async def list_announcements(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
    active_only: bool = Query(False),
):
    """Users see active announcements; admins can list all with ?active_only=false."""
    q = f"SELECT {_COLS} FROM announcements"
    if user["role"] != "admin" or active_only:
        q += " WHERE active"
    q += " ORDER BY created_at DESC LIMIT 50"
    cur = await db.execute(q)
    rows = await cur.fetchall()
    await cur.close()
    return [
        AnnouncementOut(id=str(r[0]), title=r[1], body=r[2], level=r[3], active=r[4],
                        created_at=r[5].isoformat() if r[5] else None)
        for r in rows
    ]


class AnnouncementCreate(BaseModel):
    title: str = Field(max_length=200)
    body: str
    level: str = "info"


@router.post("", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    body: AnnouncementCreate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    if body.level not in ("info", "warning", "success"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "level must be info|warning|success")
    cur = await db.execute(
        f"INSERT INTO announcements (title, body, level) VALUES (%s, %s, %s) RETURNING {_COLS}",
        (body.title, body.body, body.level),
    )
    r = await cur.fetchone()
    await cur.close()
    await log_audit(db, admin["email"], "announcement.create", body.title, f"level={body.level}")
    return AnnouncementOut(id=str(r[0]), title=r[1], body=r[2], level=r[3], active=r[4],
                           created_at=r[5].isoformat() if r[5] else None)


@router.put("/{ann_id}", response_model=AnnouncementOut)
async def update_announcement(
    ann_id: str,
    body: dict,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    updates, params = [], []
    if "active" in body:
        updates.append("active = %s"); params.append(bool(body["active"]))
    if "title" in body:
        updates.append("title = %s"); params.append(str(body["title"])[:200])
    if "body" in body:
        updates.append("body = %s"); params.append(str(body["body"]))
    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")
    params.append(ann_id)
    cur = await db.execute(
        f"UPDATE announcements SET {', '.join(updates)} WHERE id = %s RETURNING {_COLS}",
        tuple(params),
    )
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found")
    await log_audit(db, admin["email"], "announcement.update", r[1], ", ".join(updates))
    return AnnouncementOut(id=str(r[0]), title=r[1], body=r[2], level=r[3], active=r[4],
                           created_at=r[5].isoformat() if r[5] else None)


@router.delete("/{ann_id}", status_code=status.HTTP_200_OK)
async def delete_announcement(
    ann_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute("DELETE FROM announcements WHERE id = %s RETURNING title", (ann_id,))
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found")
    await log_audit(db, admin["email"], "announcement.delete", r[0], "removed")
    return {"message": "Announcement deleted"}


# ================================================================ Campaigns (bulk email)
class CampaignIn(BaseModel):
    subject: str = Field(max_length=500)
    body: str
    audience: str = "all"  # all | pro | free


@router.post("/campaign")
async def send_campaign(
    body: CampaignIn,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Send an email campaign to all / pro / free users. Logs every send."""
    if not await smtp_configured(db):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "SMTP not configured. Set it in Admin → Settings first.",
        )
    where = {"all": "", "pro": " WHERE plan = 'pro'", "free": " WHERE plan <> 'pro' OR plan IS NULL"}[body.audience]
    cur = await db.execute(f"SELECT email FROM users{where}")
    emails = [r[0] for r in await cur.fetchall()]
    await cur.close()
    sent = 0
    for e in emails:
        ok = await send_email(db, e, body.subject, body.body, kind="campaign")
        sent += 1 if ok else 0
    await log_audit(db, admin["email"], "email.campaign", body.subject[:100], f"audience={body.audience} sent={sent}/{len(emails)}")
    return {"detail": f"Campaign queued: {sent}/{len(emails)} sent", "recipients": len(emails), "sent": sent}


@router.get("/logs")
async def email_logs(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    cur = await db.execute(
        "SELECT to_email, subject, kind, status, error, created_at FROM email_logs ORDER BY created_at DESC LIMIT %s",
        (limit,),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        {"to_email": r[0], "subject": r[1], "kind": r[2], "status": r[3],
         "error": r[4], "created_at": r[5].isoformat() if r[5] else None}
        for r in rows
    ]


@router.get("/smtp-status")
async def smtp_status(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    return {"configured": await smtp_configured(db)}
