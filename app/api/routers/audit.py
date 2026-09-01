"""Audit log router — read the audit trail (admin only)."""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from psycopg import AsyncConnection

from app.core.db import get_db
from app.core.deps import get_admin_user

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
async def list_audit(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List audit entries, newest first."""
    cur = await db.execute(
        "SELECT id, actor_email, action, target, details, created_at "
        "FROM audit_logs ORDER BY created_at DESC LIMIT %s OFFSET %s",
        (limit, offset),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        {
            "id": str(r[0]),
            "actor_email": r[1],
            "action": r[2],
            "target": r[3],
            "details": r[4],
            "created_at": r[5].isoformat() if r[5] else None,
        }
        for r in rows
    ]


@router.get("/export.csv")
async def export_audit_csv(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = Query(5000, ge=1, le=50000),
):
    """v1.11.0 — dump the audit trail as CSV."""
    import csv
    import io

    cur = await db.execute(
        "SELECT created_at, actor_email, action, target, details "
        "FROM audit_logs ORDER BY created_at DESC LIMIT %s",
        (limit,),
    )
    rows = await cur.fetchall()
    await cur.close()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["created_at", "actor_email", "action", "target", "details"])
    for r in rows:
        w.writerow([
            r[0].isoformat() if r[0] else "",
            r[1] or "", r[2] or "", r[3] or "",
            (r[4] or "").replace("\r", " ").replace("\n", " "),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-log.csv"},
    )
