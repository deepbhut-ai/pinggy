"""Analytics router — daily/monthly insights for the admin dashboard (Job 7)."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from psycopg import AsyncConnection

from app.core.db import get_db
from app.core.deps import get_admin_user, get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _d(r) -> str:
    return r.isoformat() if r else ""


@router.get("/my")
async def my_analytics(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
    days: int = Query(30, ge=7, le=90),
):
    """User-scoped analytics: daily series of the caller's tunnel usage (v1.1.0)."""
    since = date.today() - timedelta(days=days - 1)
    email = user["email"]
    cur = await db.execute(
        """
        SELECT d.day::date,
               COALESCE(t.n, 0), COALESCE(t.reqs, 0), COALESCE(t.bytes, 0)
        FROM generate_series(%s::date, now()::date, interval '1 day') AS d(day)
        LEFT JOIN (
            SELECT created_at::date AS day, COUNT(*) AS n, SUM(request_count) AS reqs,
                   SUM(bytes_transferred) AS bytes
            FROM tunnels WHERE user_email = %s AND created_at >= %s GROUP BY 1
        ) t ON t.day = d.day::date
        ORDER BY 1
        """,
        (since, email, since),
    )
    daily = [
        {"day": _d(r[0]), "tunnels": r[1], "requests": r[2], "bytes": int(r[3] or 0)}
        for r in await cur.fetchall()
    ]
    await cur.close()
    cur = await db.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM tunnels WHERE user_email = %s),
          (SELECT COALESCE(SUM(request_count),0) FROM tunnels WHERE user_email = %s),
          (SELECT COALESCE(SUM(bytes_transferred),0) FROM tunnels WHERE user_email = %s),
          (SELECT COUNT(*) FROM tunnels WHERE user_email = %s AND created_at::date = now()::date),
          (SELECT COALESCE(SUM(request_count),0) FROM tunnels WHERE user_email = %s AND created_at >= date_trunc('month', now()))
        """,
        (email, email, email, email, email),
    )
    r = await cur.fetchone()
    await cur.close()
    return {
        "days": days,
        "daily": daily,
        "summary": {
            "total_tunnels": r[0], "total_requests": r[1], "total_bytes": int(r[2]),
            "tunnels_today": r[3], "requests_this_month": r[4],
        },
    }


@router.get("/overview")
async def analytics_overview(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    days: int = Query(30, ge=7, le=180),
):
    """Daily + monthly series: signups, tunnels created, tunnel requests (proxy-attributed
    where token known), revenue. Plus summary counters for today / this month."""
    since = date.today() - timedelta(days=days - 1)

    # --- daily series ---
    cur = await db.execute(
        """
        SELECT d.day::date,
               COALESCE(u.n, 0)  AS signups,
               COALESCE(t.n, 0)  AS tunnels,
               COALESCE(t.reqs, 0) AS requests,
               COALESCE(p.n, 0)  AS payments,
               COALESCE(p.rev, 0) AS revenue
        FROM generate_series(%s::date, now()::date, interval '1 day') AS d(day)
        LEFT JOIN (
            SELECT created_at::date AS day, COUNT(*) AS n
            FROM users WHERE created_at >= %s GROUP BY 1
        ) u ON u.day = d.day::date
        LEFT JOIN (
            SELECT created_at::date AS day, COUNT(*) AS n, SUM(request_count) AS reqs
            FROM tunnels WHERE created_at >= %s GROUP BY 1
        ) t ON t.day = d.day::date
        LEFT JOIN (
            SELECT created_at::date AS day, COUNT(*) AS n, SUM(amount) AS rev
            FROM payments WHERE created_at >= %s AND status = 'paid' GROUP BY 1
        ) p ON p.day = d.day::date
        ORDER BY 1
        """,
        (since, since, since, since),
    )
    daily = [
        {"day": _d(r[0]), "signups": r[1], "tunnels": r[2], "requests": r[3],
         "payments": r[4], "revenue": float(r[5] or 0)}
        for r in await cur.fetchall()
    ]
    await cur.close()

    # --- monthly series (last 12 months) ---
    cur = await db.execute(
        """
        SELECT to_char(m.month, 'YYYY-MM'),
               COALESCE(u.n, 0), COALESCE(t.n, 0), COALESCE(t.reqs, 0),
               COALESCE(p.n, 0), COALESCE(p.rev, 0)
        FROM generate_series(date_trunc('month', now()) - interval '11 months',
                             date_trunc('month', now()), interval '1 month') AS m(month)
        LEFT JOIN (
            SELECT date_trunc('month', created_at) AS month, COUNT(*) AS n
            FROM users GROUP BY 1
        ) u ON u.month = m.month
        LEFT JOIN (
            SELECT date_trunc('month', created_at) AS month, COUNT(*) AS n, SUM(request_count) AS reqs
            FROM tunnels GROUP BY 1
        ) t ON t.month = m.month
        LEFT JOIN (
            SELECT date_trunc('month', created_at) AS month, COUNT(*) AS n, SUM(amount) AS rev
            FROM payments WHERE status = 'paid' GROUP BY 1
        ) p ON p.month = m.month
        ORDER BY 1
        """
    )
    monthly = [
        {"month": r[0], "signups": r[1], "tunnels": r[2], "requests": r[3],
         "payments": r[4], "revenue": float(r[5] or 0)}
        for r in await cur.fetchall()
    ]
    await cur.close()

    # --- summary ---
    cur = await db.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM users WHERE created_at::date = now()::date),
          (SELECT COUNT(*) FROM users WHERE created_at >= date_trunc('month', now())),
          (SELECT COUNT(*) FROM tunnels WHERE created_at::date = now()::date),
          (SELECT COUNT(*) FROM tunnels WHERE created_at >= date_trunc('month', now())),
          (SELECT COALESCE(SUM(amount),0) FROM payments
             WHERE status='paid' AND created_at >= date_trunc('month', now())),
          (SELECT COUNT(*) FROM users WHERE plan='pro'),
          (SELECT COUNT(*) FROM users)
        """
    )
    r = await cur.fetchone()
    await cur.close()
    summary = {
        "signups_today": r[0], "signups_this_month": r[1],
        "tunnels_today": r[2], "tunnels_this_month": r[3],
        "revenue_this_month": float(r[4]),
        "pro_users": r[5], "total_users": r[6],
    }
    return {"days": days, "daily": daily, "monthly": monthly, "summary": summary}
