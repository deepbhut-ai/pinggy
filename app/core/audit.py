"""Audit log helper — records admin/user actions to the audit_logs table.

Fire-and-forget: a failed audit write must NEVER fail the business action,
so errors are swallowed (logged at debug level).
"""
import logging

from psycopg import AsyncConnection

logger = logging.getLogger("audit")


async def log_audit(
    db: AsyncConnection,
    actor_email: str,
    action: str,
    target: str | None = None,
    details: str | None = None,
) -> None:
    """Append one audit entry. Call within the same request/connection."""
    try:
        cur = await db.execute(
            "INSERT INTO audit_logs (actor_email, action, target, details) VALUES (%s, %s, %s, %s)",
            (actor_email, action[:50], (target or "")[:255] or None, details or None),
        )
        await cur.close()
    except Exception as e:  # never break the caller
        logger.debug("audit log write failed: %s", e)
