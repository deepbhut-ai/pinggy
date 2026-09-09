"""Email core — SMTP send via app_settings (DB > env), logged to email_logs.

Settings keys (app_settings): smtp_host, smtp_port, smtp_user, smtp_password,
smtp_from, smtp_enabled. All sends are best-effort and logged; failures never
break the calling request.
"""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

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


async def _build_html_email(db: AsyncConnection, subject: str, body: str) -> str:
    """Build the HTML version of an email.

    If the body is a full HTML document (contains <body>, <html>, or a
    table-based layout), send it as-is — the admin designed it themselves.
    Otherwise, wrap simple HTML / plain text in our branded template.
    """
    stripped = body.strip().lower()

    # ---- Full custom HTML: send as-is (admin pasted a complete email design) ----
    if "<body" in stripped or "<html" in stripped or "<!doctype" in stripped:
        # Ensure it has charset meta for proper rendering
        if "charset" not in stripped:
            body = body.replace("<head>", '<head><meta charset="utf-8">', 1) if "<head>" in body else body
        return body

    # ---- Branded wrapper for simple content ----
    logo_url = await get_setting(db, "email_logo_url", "")
    brand_color = await get_setting(db, "email_brand_color", "#6aa6f0") or "#6aa6f0"
    company_name = await get_setting(db, "email_company_name", "IRAGT") or "IRAGT"
    footer_text = await get_setting(db, "email_footer_text", "") or ""
    support_email = await get_setting(db, "email_support_email", "") or ""

    # Detect if body is simple HTML (has tags but not a full document)
    is_html = stripped.startswith("<") or "<div" in stripped or "<b>" in stripped or "<a " in stripped or "<h" in stripped
    body_html = body if is_html else body.replace("\n", "<br>\n")

    logo_html = f'<img src="{logo_url}" alt="{company_name}" style="max-height:50px;margin-bottom:1rem;">' if logo_url and logo_url.strip() else ""
    footer_html = ""
    if footer_text or support_email:
        footer_parts = []
        if footer_text:
            footer_parts.append(footer_text)
        if support_email:
            footer_parts.append(f'Support: <a href="mailto:{support_email}" style="color:#999;">{support_email}</a>')
        footer_html = f'<div style="margin-top:2rem;padding-top:1rem;border-top:1px solid #eee;font-size:.8rem;color:#999;">{" · ".join(footer_parts)}</div>'

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <div style="background:{brand_color};padding:1.5rem 2rem;text-align:center;">
    {logo_html}
    {'' if logo_html else f'<div style="font-size:1.5rem;font-weight:700;color:#fff;">{company_name}</div>'}
  </div>
  <div style="padding:2rem;">
    <h2 style="margin:0 0 1rem;color:#1a1a2e;font-size:1.25rem;">{subject}</h2>
    <div style="color:#333;font-size:.9rem;line-height:1.6;">
      {body_html}
    </div>
    {footer_html}
  </div>
</div>
</body></html>"""


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
    from_name = await get_setting(db, "email_from_name", "") or ""

    # Build HTML version with branding wrapper
    html_body = await _build_html_email(db, subject, body)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{sender}>" if from_name else str(sender)
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain"))      # plain text fallback
    msg.attach(MIMEText(html_body, "html"))  # branded HTML version
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


async def _get_db_template(db: AsyncConnection, key: str):
    """Return (subject, body) from DB email_templates, or None if not found / inactive."""
    try:
        cur = await db.execute(
            "SELECT subject, body FROM email_templates WHERE key = %s AND is_active = TRUE",
            (key,),
        )
        r = await cur.fetchone()
        await cur.close()
        if r:
            return r[0], r[1]
    except Exception:
        pass
    return None


async def send_template(db: AsyncConnection, to_email: str, kind: str, **fields) -> bool:
    # 1. Try DB template (admin-customized) — must be active
    db_tmpl = await _get_db_template(db, kind)
    if db_tmpl:
        subject, body = db_tmpl
    elif kind in TEMPLATES:
        subject, body = TEMPLATES[kind]
    else:
        logger.warning("send_template: unknown template key '%s'", kind)
        return False

    # 2. Replace placeholders
    for k, v in fields.items():
        subject = subject.replace("{" + k + "}", str(v))
        body = body.replace("{" + k + "}", str(v))
    return await send_email(db, to_email, subject, body, kind=kind)
