"""Support tickets router (v1.4.0) — user submits/tracks, admin replies/closes."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user, get_current_user

router = APIRouter(prefix="/tickets", tags=["tickets"])


class TicketIn(BaseModel):
    subject: str = Field(max_length=200)
    message: str = Field(min_length=1)


def _ticket(r) -> dict:
    return {"id": str(r[0]), "user_email": r[1], "subject": r[2], "status": r[3],
            "created_at": r[4].isoformat() if r[4] else None,
            "updated_at": r[5].isoformat() if r[5] else None}


# ---------------------------------------------------------------- user
@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ticket(
    body: TicketIn,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "INSERT INTO tickets (user_email, subject) VALUES (%s, %s) RETURNING id, user_email, subject, status, created_at, updated_at",
        (user["email"], body.subject),
    )
    t = await cur.fetchone()
    await cur.close()
    cur = await db.execute(
        "INSERT INTO ticket_messages (ticket_id, sender_email, is_staff, body) VALUES (%s, %s, FALSE, %s)",
        (t[0], user["email"], body.message),
    )
    await cur.close()
    await log_audit(db, user["email"], "ticket.create", body.subject[:80], f"ticket {t[0]}")
    return _ticket(t)


@router.get("/my")
async def my_tickets(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "SELECT id, user_email, subject, status, created_at, updated_at FROM tickets "
        "WHERE user_email = %s ORDER BY updated_at DESC",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [_ticket(r) for r in rows]


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "SELECT id, user_email, subject, status, created_at, updated_at FROM tickets WHERE id = %s",
        (ticket_id,),
    )
    t = await cur.fetchone()
    await cur.close()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    if t[1] != user["email"] and user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your ticket")
    cur = await db.execute(
        "SELECT sender_email, is_staff, body, created_at FROM ticket_messages WHERE ticket_id = %s ORDER BY created_at",
        (ticket_id,),
    )
    msgs = [
        {"sender": m[0], "is_staff": m[1], "body": m[2],
         "created_at": m[3].isoformat() if m[3] else None}
        for m in await cur.fetchall()
    ]
    await cur.close()
    out = _ticket(t)
    out["messages"] = msgs
    return out


class ReplyIn(BaseModel):
    message: str = Field(min_length=1)


@router.post("/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: str,
    body: ReplyIn,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute("SELECT user_email, status FROM tickets WHERE id = %s", (ticket_id,))
    t = await cur.fetchone()
    await cur.close()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    is_staff = user["role"] == "admin"
    if t[0] != user["email"] and not is_staff:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your ticket")
    if t[1] == "closed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ticket is closed")
    cur = await db.execute(
        "INSERT INTO ticket_messages (ticket_id, sender_email, is_staff, body) VALUES (%s, %s, %s, %s)",
        (ticket_id, user["email"], is_staff, body.message),
    )
    await cur.close()
    new_status = "answered" if is_staff else "open"
    cur = await db.execute(
        "UPDATE tickets SET status = %s, updated_at = now() WHERE id = %s",
        (new_status, ticket_id),
    )
    await cur.close()
    if is_staff:
        # notify the ticket owner (best-effort)
        try:
            from app.core.email import send_email
            await send_email(
                db, t[0], f"Re: your IRAGT support ticket — {ticket_id[:8]}",
                f"Support replied to your ticket.\n\n{body.message[:500]}\n\nView the full conversation in your dashboard → Support.",
                kind="ticket",
            )
        except Exception:
            pass
    return {"replied": True, "status": new_status}


@router.post("/{ticket_id}/close")
async def close_ticket(
    ticket_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute("SELECT user_email FROM tickets WHERE id = %s", (ticket_id,))
    t = await cur.fetchone()
    await cur.close()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    if t[0] != user["email"] and user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your ticket")
    cur = await db.execute(
        "UPDATE tickets SET status = 'closed', updated_at = now() WHERE id = %s", (ticket_id,)
    )
    await cur.close()
    return {"closed": ticket_id}


# ---------------------------------------------------------------- admin
@router.get("/admin/all")
async def admin_tickets(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    status_filter: str | None = Query(None, alias="status"),
):
    q = "SELECT id, user_email, subject, status, created_at, updated_at FROM tickets"
    params: list = []
    if status_filter:
        q += " WHERE status = %s"
        params.append(status_filter)
    q += " ORDER BY updated_at DESC LIMIT 200"
    cur = await db.execute(q, tuple(params))
    rows = await cur.fetchall()
    await cur.close()
    return [_ticket(r) for r in rows]
