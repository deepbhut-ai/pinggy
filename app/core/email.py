"""Email core — SMTP send via app_settings (DB > env), logged to email_logs.

Settings keys (app_settings): smtp_host, smtp_port, smtp_user, smtp_password,
smtp_from, smtp_enabled. All sends are best-effort and logged; failures never
break the calling request.
"""
import logging
import smtplib
from email.mime.text import MIMEText

from psycopg import AsyncConnection

from app.core.app_settings import get_setting

logger = logging.getLogger("email")

SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from", "smtp_enabled"]

TEMPLATES = {
    "welcome": ("Welcome to IRAGT ⚡", "Hi {name},\n\nYour IRAGT account is ready. Run your first tunnel:\n  ssh -p {ssh_port} -R0:localhost:8080 <your-token>@{ssh_host}\n\nHappy tunneling!"),
    "reset": ("Reset your Tunnel password", "Hi,\n\nUse this link to reset your password (valid {minutes} minutes):\n{base_url}/login?reset={token}\n\nIf you didn't request this, ignore this email."),
    "tunnel_stopped": ("Your tunnel was stopped", "Your tunnel {subdomain} has been disconnected.\nRe-run your SSH command to start a new tunnel."),
}


async def smtp_configured(db: AsyncConnection) -> bool:
    enabled = await get_setting(db, "smtp_enabled")
    if isinstance(enabled, str) and enabled.lower() in ("1", "true", "yes", "on"):
        host = await get_setting(db, "smtp_host")
        return bool(host and str(host).strip())
    if isinstance(enabled, bool) and enabled:
        return bool(await get_setting(db, "smtp_host"))
    return False


async def send_email(
    db: AsyncConnection,
    to_email: str,
    subject: str,
    body: str,
    kind: str = "campaign",
) -> bool:
    """Send via configured SMTP; always log to email_logs. Returns True if sent."""
    log_id = None
    try:
        cur = await db.execute(
            "INSERT INTO email_logs (to_email, subject, kind, status) VALUES (%s, %s, %s, 'pending') RETURNING id",
            (to_email, subject[:500], kind[:40]),
        )
        log_id = (await cur.fetchone())[0]
        await cur.close()
    except Exception as e:
        logger.debug("email log insert failed: %s", e)

    def _fail(err: str):
        # best-effort status update; fire-and-forget style
        try:
            import asyncio
            asyncio.get_running_loop()  # ensure we're in a loop context
        except RuntimeError:
            pass
        logger.warning("email to %s failed: %s", to_email, err)

    if not await smtp_configured(db):
        _fail("SMTP not configured (set it in Admin → Settings)")
        if log_id:
            try:
                cur = await db.execute(
                    "UPDATE email_logs SET status='failed', error=%s WHERE id=%s",
                    ("SMTP not configured", log_id),
                )
                await cur.close()
            except Exception:
                pass
        return False

    host = await get_setting(db, "smtp_host")
    port = int(await get_setting(db, "smtp_port", 587))
    user = await get_setting(db, "smtp_user")
    password = await get_setting(db, "smtp_password")
    sender = await get_setting(db, "smtp_from", user or "no-reply@tunnel.local")

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = str(sender)
    msg["To"] = to_email
    try:
        import asyncio
        def _smtp_send():
            with smtplib.SMTP(str(host), port, timeout=15) as s:
                s.starttls()
                if user and password:
                    s.login(str(user), str(password))
                s.send_message(msg)
        await asyncio.to_thread(_smtp_send)
        if log_id:
            cur = await db.execute("UPDATE email_logs SET status='sent' WHERE id=%s", (log_id,))
            await cur.close()
        return True
    except Exception as e:
        _fail(str(e))
        if log_id:
            try:
                cur = await db.execute(
                    "UPDATE email_logs SET status='failed', error=%s WHERE id=%s", (str(e)[:500], log_id)
                )
                await cur.close()
            except Exception:
                pass
        return False


async def send_template(db: AsyncConnection, to_email: str, kind: str, **fields) -> bool:
    subject, body = TEMPLATES[kind]
    for k, v in fields.items():
        body = body.replace("{" + k + "}", str(v))
    return await send_email(db, to_email, subject, body, kind=kind)
