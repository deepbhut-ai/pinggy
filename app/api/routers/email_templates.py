"""Email templates router — admin CRUD for dynamic email templates."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user
from app.core.email import send_email, smtp_configured, TEMPLATES as HARDCODED_TEMPLATES
from app.core.app_settings import get_setting, set_setting

router = APIRouter(prefix="/email-templates", tags=["email-templates"])


class EmailTemplateOut(BaseModel):
    id: str
    key: str
    name: str
    description: str | None = None
    subject: str
    body: str
    placeholders: str | None = None
    is_active: bool
    is_system: bool
    is_custom: bool
    created_at: str | None = None
    updated_at: str | None = None


_COLS = "id, key, name, description, subject, body, placeholders, is_active, is_system, created_at, updated_at"


def _row_to_out(r) -> EmailTemplateOut:
    return EmailTemplateOut(
        id=str(r[0]), key=r[1], name=r[2], description=r[3],
        subject=r[4], body=r[5], placeholders=r[6],
        is_active=r[7], is_system=r[8],
        created_at=r[9].isoformat() if r[9] else None,
        updated_at=r[10].isoformat() if r[10] else None,
        is_custom=not r[8],
    )


@router.get("", response_model=list[EmailTemplateOut])
async def list_templates(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(f"SELECT {_COLS} FROM email_templates ORDER BY is_system DESC, key ASC")
    rows = await cur.fetchall()
    await cur.close()
    return [_row_to_out(r) for r in rows]


# ================================================================
# SMTP Config — manage email server settings + test + logs
# (MUST be before /{key} routes to avoid path-param conflict)
# ================================================================

SMTP_FIELDS = ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from", "smtp_enabled"]
BRANDING_FIELDS = ["email_logo_url", "email_brand_color", "email_company_name", "email_footer_text", "email_support_email", "email_from_name"]


@router.get("/smtp/config")
async def get_smtp_config(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get current SMTP settings (password masked)."""
    out = {}
    for key in SMTP_FIELDS:
        raw = await get_setting(db, key)
        if key == "smtp_password":
            out[key] = "••••" if raw else ""
            out[f"{key}_set"] = bool(raw)
        elif key == "smtp_enabled":
            val = raw
            if isinstance(val, str):
                val = val.lower() in ("1", "true", "yes", "on")
            out[key] = bool(val) if val is not None else False
        else:
            out[key] = str(raw) if raw is not None else ""
    out["configured"] = await smtp_configured(db)
    # Branding settings
    for key in BRANDING_FIELDS:
        raw = await get_setting(db, key)
        out[key] = str(raw) if raw else ""
    return out


class SmtpConfigUpdate(BaseModel):
    smtp_host: str = ""
    smtp_port: str = ""
    smtp_user: str = ""
    smtp_password: str = ""  # empty = keep existing
    smtp_from: str = ""
    smtp_enabled: bool = False
    email_logo_url: str = ""
    email_brand_color: str = "#6aa6f0"
    email_company_name: str = "IRAGT"
    email_footer_text: str = ""
    email_support_email: str = ""
    email_from_name: str = ""


@router.put("/smtp/config")
async def update_smtp_config(
    body: SmtpConfigUpdate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update SMTP settings. Password only changed if non-empty value sent."""
    for key in SMTP_FIELDS + BRANDING_FIELDS:
        if key == "smtp_password":
            if body.smtp_password:  # only update if non-empty
                await set_setting(db, key, body.smtp_password, updated_by=admin["email"])
        elif key == "smtp_enabled":
            await set_setting(db, key, "true" if body.smtp_enabled else "false", updated_by=admin["email"])
        else:
            val = getattr(body, key, "")
            if val is not None:
                await set_setting(db, key, str(val), updated_by=admin["email"])
    await log_audit(db, admin["email"], "smtp.update", "", f"host={body.smtp_host} enabled={body.smtp_enabled}")
    return {"detail": "SMTP settings saved", "configured": await smtp_configured(db)}


class SmtpTestSend(BaseModel):
    to_email: str = ""


@router.post("/smtp/test")
async def smtp_test_send(
    payload: SmtpTestSend,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Send a simple test email through the configured SMTP server."""
    target = payload.to_email or admin["email"]
    ok = await send_email(
        db, target,
        "IRAGT SMTP Test",
        "This is a test email from IRAGT.\n\nIf you received this, your SMTP configuration is working correctly.\n\nSent by: " + admin["email"],
        kind="smtp_test",
    )
    if not ok:
        configured = await smtp_configured(db)
        if not configured:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "SMTP not configured — set host, port, user, password and enable it")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to send — check SMTP credentials and port")
    await log_audit(db, admin["email"], "smtp.test", "", f"sent to {target}")
    return {"detail": f"Test email sent to {target}", "sent": True}


@router.get("/logs")
async def email_logs(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    """Recent email send attempts — newest first."""
    cur = await db.execute(
        "SELECT to_email, subject, kind, status, error, created_at "
        "FROM email_logs ORDER BY created_at DESC LIMIT %s",
        (limit,),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        {"to_email": r[0], "subject": r[1], "kind": r[2], "status": r[3],
         "error": r[4], "created_at": r[5].isoformat() if r[5] else None}
        for r in rows
    ]


@router.get("/{key}", response_model=EmailTemplateOut)
async def get_template(
    key: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(f"SELECT {_COLS} FROM email_templates WHERE key = %s", (key,))
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    return _row_to_out(r)


class TemplateUpdate(BaseModel):
    subject: str = Field(min_length=1, max_length=500)
    body: str = Field(min_length=1)
    is_active: bool = True


@router.put("/{key}", response_model=EmailTemplateOut)
async def update_template(
    key: str,
    payload: TemplateUpdate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        """UPDATE email_templates
           SET subject = %s, body = %s, is_active = %s, updated_at = now()
           WHERE key = %s
           RETURNING """ + _COLS,
        (payload.subject, payload.body, payload.is_active, key),
    )
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    await log_audit(db, admin["email"], "email_template.update", key, f"subject={payload.subject[:60]}")
    return _row_to_out(r)


class TemplateCreate(BaseModel):
    key: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=1, max_length=100)
    description: str = ""
    subject: str = Field(min_length=1, max_length=500)
    body: str = Field(min_length=1)
    placeholders: str = ""


@router.post("", response_model=EmailTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateCreate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute("SELECT id FROM email_templates WHERE key = %s", (payload.key,))
    if await cur.fetchone():
        await cur.close()
        raise HTTPException(status.HTTP_409_CONFLICT, "Template key already exists")
    await cur.close()

    cur = await db.execute(
        """INSERT INTO email_templates (key, name, description, subject, body, placeholders, is_system)
           VALUES (%s, %s, %s, %s, %s, %s, FALSE)
           RETURNING """ + _COLS,
        (payload.key, payload.name, payload.description, payload.subject, payload.body, payload.placeholders),
    )
    r = await cur.fetchone()
    await cur.close()
    await log_audit(db, admin["email"], "email_template.create", payload.key, f"name={payload.name}")
    return _row_to_out(r)


@router.post("/{key}/reset", response_model=EmailTemplateOut)
async def reset_template(
    key: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Reset a system template back to its hardcoded default."""
    if key not in HARDCODED_TEMPLATES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only system templates can be reset")

    subject, body = HARDCODED_TEMPLATES[key]
    cur = await db.execute(
        """UPDATE email_templates
           SET subject = %s, body = %s, is_active = TRUE, updated_at = now()
           WHERE key = %s AND is_system = TRUE
           RETURNING """ + _COLS,
        (subject, body, key),
    )
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    await log_audit(db, admin["email"], "email_template.reset", key, "reset to default")
    return _row_to_out(r)


class TestSend(BaseModel):
    to_email: str = ""


@router.post("/{key}/test")
async def send_test_email(
    key: str,
    payload: TestSend,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Send a test email using this template (with placeholder values)."""
    cur = await db.execute(
        "SELECT subject, body, placeholders FROM email_templates WHERE key = %s",
        (key,),
    )
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")

    subject, body, placeholders = r
    # Fill placeholders with sample values
    sample_vals = {
        "name": "Test User",
        "ssh_port": "2222",
        "ssh_host": "ssh.iraglobaltech.com",
        "code": "123456",
        "token": "sample-reset-token-abc123",
        "minutes": "30",
        "base_url": "https://iraglobaltech.com",
        "subdomain": "test123",
        "email": admin["email"],
        "key_name": "Test Key",
        "key_prefix": "sk_test_",
        "ticket_id": "abc12345",
        "message": "This is a test reply message.",
        "requests": "1,234",
        "data_gb": "5.67",
        "tunnels": "tunnel1, tunnel2",
        "tokens": "3",
    }
    if placeholders:
        for ph in [p.strip() for p in placeholders.split(",") if p.strip()]:
            subject = subject.replace("{" + ph + "}", str(sample_vals.get(ph, f"[{ph}]")))
            body = body.replace("{" + ph + "}", str(sample_vals.get(ph, f"[{ph}]")))

    target = payload.to_email or admin["email"]
    ok = await send_email(db, target, subject, body, kind=f"test:{key}")
    if not ok:
        configured = await smtp_configured(db)
        if not configured:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "SMTP not configured — set it in Admin → Settings")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to send test email — check SMTP settings")
    await log_audit(db, admin["email"], "email_template.test", key, f"sent to {target}")
    return {"detail": f"Test email sent to {target}", "sent": True}


@router.delete("/{key}")
async def delete_template(
    key: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete a custom (non-system) template."""
    cur = await db.execute("DELETE FROM email_templates WHERE key = %s AND is_system = FALSE RETURNING id", (key,))
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found or is a system template (cannot delete)")
    await log_audit(db, admin["email"], "email_template.delete", key, "custom template deleted")
    return {"detail": "Template deleted"}