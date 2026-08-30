"""Weekly usage digest + team activity feed (v1.13.0).

Digest: a background task started at app boot; every hour checks whether a
user's weekly digest is due (Mon 08:00 UTC by default, tracked in Redis
digest:sent:<email> with 7d TTL to avoid double-sends) and emails a usage
summary built from the tunnels + audit tables.

Team activity: derived from audit_logs filtered to team-scoped actions.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("digest")


async def send_weekly_digests() -> int:
    """One pass: send due digests. Returns count sent."""
    from app.core.db import get_conn
    from app.core.email import send_email
    from app.core.redis import get_redis

    now = datetime.now(timezone.utc)
    r = get_redis()

    async with get_conn() as db:
        cur = await db.execute(
            "SELECT email, full_name FROM users WHERE is_active = TRUE"
        )
        users = await cur.fetchall()
        await cur.close()

        sent = 0
        for email, full_name in users:
            try:
                if r is not None:
                    if await r.exists(f"digest:sent:{email}"):
                        continue
                    if now.weekday() != 0 or now.hour != 8:  # Monday 08:00 UTC
                        continue
                cur = await db.execute(
                    """
                    SELECT COALESCE(SUM(request_count), 0), COALESCE(SUM(bytes_transferred), 0),
                           COUNT(DISTINCT subdomain)
                    FROM tunnels WHERE user_email = %s AND created_at > now() - interval '7 days'
                    """,
                    (email,),
                )
                req, byt, subs = await cur.fetchone()
                await cur.close()
                cur = await db.execute(
                    "SELECT COUNT(*) FROM tokens WHERE user_email = %s", (email,)
                )
                tokens = (await cur.fetchone())[0]
                await cur.close()

                gb = byt / 1_073_741_824
                body = (
                    f"Hi {full_name or email},\n\n"
                    f"Your IRAGT week in review:\n\n"
                    f"  • Requests served:  {req:,}\n"
                    f"  • Data transferred: {gb:.2f} GB\n"
                    f"  • Tunnel addresses: {subs}\n"
                    f"  • Active tokens:    {tokens}\n\n"
                    f"Manage everything at your IRAGT dashboard.\n"
                )
                await send_email(
                    db, email,
                    f"Your IRAGT weekly digest — {req:,} requests",
                    body,
                    kind="digest",
                )
                if r is not None:
                    await r.setex(f"digest:sent:{email}", 7 * 24 * 3600, "1")
                sent += 1
            except Exception as e:
                logger.debug("digest for %s failed: %s", email, e)
        return sent


async def digest_scheduler() -> None:
    """Hourly tick; sends digests when due."""
    while True:
        try:
            await send_weekly_digests()
        except Exception as e:
            logger.debug("digest pass error: %s", e)
        await asyncio.sleep(3600)


def start_digest_task() -> asyncio.Task:
    return asyncio.create_task(digest_scheduler())


# ---- Team activity feed ----

TEAM_ACTIONS = (
    "team.create", "team.delete", "team.add_member", "team.remove_member",
    "team.role_change", "token.team_assign",
)


async def team_activity(db, team_id: str, limit: int = 50) -> list[dict]:
    """Recent team-relevant audit events (v1.13.0).

    Matches audit rows whose details mention the team id or whose actor is a
    member of the team and action is team-scoped."""
    cur = await db.execute(
        """
        SELECT a.created_at, a.actor_email, a.action, a.target, a.details
        FROM audit_logs a
        WHERE a.action = ANY(%s)
          AND (
                a.details ILIKE %s
             OR a.actor_email IN (SELECT user_email FROM team_members WHERE team_id = %s)
          )
        ORDER BY a.created_at DESC
        LIMIT %s
        """,
        (list(TEAM_ACTIONS), f"%{team_id}%", team_id, limit),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        {
            "at": r[0].isoformat() if r[0] else None,
            "actor": r[1],
            "action": r[2],
            "target": r[3],
            "details": r[4],
        }
        for r in rows
    ]
