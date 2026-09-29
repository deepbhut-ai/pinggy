"""Edge Controller Router — registration, token verification, and automated Cloudflare DNS for remote edge nodes."""
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field
from starlette.responses import PlainTextResponse

from app.core.audit import log_audit
from app.core.cloudflare import sync_region_dns
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_admin_user

logger = logging.getLogger("edge_controller")

router = APIRouter(tags=["edge-controller"])

PROJECT_ROOT = Path(__file__).resolve().parents[3]


# -----------------------------------------------------------------
# Request / Response Schemas
# -----------------------------------------------------------------
class EdgeRegisterIn(BaseModel):
    region_code: str = Field(min_length=2, max_length=20, pattern=r"^[a-z0-9-]+$")
    node_secret: str = Field(min_length=8, max_length=64)
    server_ip: str = Field(min_length=7, max_length=45)
    ssh_port: int = Field(default=2222, ge=1, le=65535)
    proxy_domain: str | None = None


class EdgeVerifyTokenIn(BaseModel):
    token: str = Field(min_length=4, max_length=128)
    node_secret: str = Field(min_length=8, max_length=64)
    region_code: str = Field(min_length=2, max_length=20)


class EdgeHeartbeatIn(BaseModel):
    region_code: str = Field(min_length=2, max_length=20)
    node_secret: str = Field(min_length=8, max_length=64)
    active_tunnels: int = 0
    uptime_seconds: int = 0


# -----------------------------------------------------------------
# Public Setup & Daemon Download Endpoints
# -----------------------------------------------------------------
@router.get("/edge/setup.sh", response_class=PlainTextResponse)
@router.get("/api/v1/edge/setup.sh", response_class=PlainTextResponse)
async def get_edge_setup_script(request: Request):
    """Serve the 1-line automated bash installer script."""
    script_path = PROJECT_ROOT / "scripts" / "edge_setup.sh"
    if script_path.exists():
        content = script_path.read_text(encoding="utf-8")
    else:
        content = "#!/usr/bin/env bash\necho 'Error: edge_setup.sh not found'\nexit 1\n"
    return PlainTextResponse(content=content, media_type="text/x-shellscript")


@router.get("/edge/daemon.py", response_class=PlainTextResponse)
@router.get("/api/v1/edge/daemon.py", response_class=PlainTextResponse)
async def get_edge_daemon_code():
    """Serve the raw edge daemon Python code for download by edge servers."""
    daemon_path = PROJECT_ROOT / "app" / "edge" / "edge_daemon.py"
    if daemon_path.exists():
        content = daemon_path.read_text(encoding="utf-8")
    else:
        content = "#!/usr/bin/env python3\nprint('Error: edge_daemon.py not found')\n"
    return PlainTextResponse(content=content, media_type="text/x-python")


# -----------------------------------------------------------------
# Edge Node Lifecycle APIs
# -----------------------------------------------------------------
@router.post("/api/v1/edge/register")
async def register_edge_node(
    body: EdgeRegisterIn,
    db: AsyncConnection = Depends(get_db),
):
    """Auto-register a remote edge server and sync Cloudflare DNS records."""
    code = body.region_code.strip().lower()
    ip = body.server_ip.strip()
    secret = body.node_secret.strip()
    ssh_port = body.ssh_port
    domain = body.proxy_domain or f"{code}.{settings.TUNNEL_DOMAIN}"
    ssh_host = f"{code}.ssh.{settings.TUNNEL_DOMAIN}"

    # Check if region already exists in DB
    cur = await db.execute("SELECT code, node_secret FROM regions WHERE code = %s", (code,))
    row = await cur.fetchone()
    await cur.close()

    if row:
        stored_secret = row[1] or ""
        if stored_secret and stored_secret != secret:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid node_secret for existing region code",
            )
        # Update existing record
        cur = await db.execute(
            """
            UPDATE regions
            SET server_ip = %s, ssh_host = %s, ssh_port = %s, proxy_domain = %s,
                node_secret = %s, is_active = TRUE, updated_at = NOW()
            WHERE code = %s
            """,
            (ip, ssh_host, ssh_port, domain, secret, code),
        )
        await cur.close()
    else:
        # Create new region record
        name = f"Edge PoP ({code.upper()})"
        cur = await db.execute(
            """
            INSERT INTO regions (code, name, flag, server_ip, ssh_host, ssh_port,
                                 proxy_domain, node_secret, is_active, max_capacity)
            VALUES (%s, %s, '🌐', %s, %s, %s, %s, %s, TRUE, 1000)
            """,
            (code, name, ip, ssh_host, ssh_port, domain, secret),
        )
        await cur.close()

    # Trigger Cloudflare DNS automation
    cf_res = await sync_region_dns(code=code, server_ip=ip, db=db, base_domain=settings.TUNNEL_DOMAIN)

    await log_audit(
        db,
        "system",
        "edge.node_registered",
        code,
        f"Remote node auto-registered at {ip} (CF synced: {cf_res.get('synced', False)})",
    )

    return {
        "status": "success",
        "region_code": code,
        "server_ip": ip,
        "ssh_host": ssh_host,
        "proxy_domain": domain,
        "cloudflare": cf_res,
    }


@router.post("/api/v1/edge/verify-token")
async def verify_edge_token(
    body: EdgeVerifyTokenIn,
    db: AsyncConnection = Depends(get_db),
):
    """Authenticate a developer's tunnel token and load multi-port configurations."""
    code = body.region_code.strip().lower()
    secret = body.node_secret.strip()
    token = body.token.strip()

    # 1. Verify node secret
    cur = await db.execute("SELECT node_secret, is_active, is_maintenance FROM regions WHERE code = %s", (code,))
    reg_row = await cur.fetchone()
    await cur.close()

    if not reg_row or reg_row[0] != secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized edge node")
    if not reg_row[1] or reg_row[2]:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Region node is disabled or in maintenance")

    # 2. Check tokens table
    user_email = None
    custom_domain = ""
    fixed_subdomain = ""
    plan = "free"
    token_local_port = 8080

    cur = await db.execute(
        """
        SELECT t.user_email, t.custom_domain, t.fixed_subdomain, t.local_port, u.is_active, u.plan
        FROM tokens t
        JOIN users u ON u.email = t.user_email
        WHERE t.token = %s
        """,
        (token,),
    )
    row = await cur.fetchone()
    await cur.close()

    if row:
        if not row[4]:
            return {"valid": False, "reason": "user_disabled"}
        user_email = row[0]
        custom_domain = row[1] or ""
        fixed_subdomain = row[2] or ""
        token_local_port = row[3] or 8080
        plan = row[5] or "free"

    if not user_email:
        # Fallback to users table
        cur = await db.execute(
            "SELECT email, custom_domain, is_active, plan FROM users WHERE tunnel_token = %s",
            (token,),
        )
        u_row = await cur.fetchone()
        await cur.close()
        if not u_row or not u_row[2]:
            return {"valid": False, "reason": "invalid_or_disabled"}
        user_email = u_row[0]
        custom_domain = u_row[1] or ""
        plan = u_row[3] or "free"

    # 3. Load saved multiport rules
    ports = []
    try:
        cur = await db.execute(
            "SELECT config FROM tunnel_configs WHERE user_email = %s AND name = %s",
            (user_email, f"multiport:{token}"),
        )
        mp_row = await cur.fetchone()
        await cur.close()
        if mp_row:
            cfg = json.loads(mp_row[0]) if isinstance(mp_row[0], str) else mp_row[0]
            for addr, info in cfg.get("ports", {}).items():
                if isinstance(info, dict) and info.get("enabled", True):
                    try:
                        p_val = int(info.get("port", 8080))
                        ports.append({"domain": addr, "local_port": p_val})
                    except (ValueError, TypeError):
                        pass
    except Exception:
        pass

    if not ports:
        main_addr = custom_domain or (f"{fixed_subdomain}.{settings.TUNNEL_DOMAIN}" if fixed_subdomain else "")
        if main_addr:
            ports.append({"domain": main_addr, "local_port": token_local_port})

    return {
        "valid": True,
        "user_email": user_email,
        "plan": plan,
        "custom_domain": custom_domain,
        "fixed_subdomain": fixed_subdomain,
        "ports": ports,
    }


@router.post("/api/v1/edge/heartbeat")
async def record_edge_heartbeat(
    body: EdgeHeartbeatIn,
    db: AsyncConnection = Depends(get_db),
):
    """Receive live telemetry and active tunnel counts from edge nodes."""
    code = body.region_code.strip().lower()
    secret = body.node_secret.strip()

    cur = await db.execute("SELECT node_secret FROM regions WHERE code = %s", (code,))
    row = await cur.fetchone()
    await cur.close()

    if not row or row[0] != secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized node")

    cur = await db.execute("UPDATE regions SET updated_at = NOW() WHERE code = %s", (code,))
    await cur.close()

    return {"status": "ok", "region": code}


# -----------------------------------------------------------------
# Admin UI Join Command Generator
# -----------------------------------------------------------------
@router.get("/api/v1/admin/regions/{code}/join-command")
async def get_admin_join_command(
    code: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Generate the complete 1-line installation curl command for an edge region."""
    import secrets

    code = code.strip().lower()
    cur = await db.execute("SELECT code, name, server_ip, node_secret, ssh_port FROM regions WHERE code = %s", (code,))
    row = await cur.fetchone()
    await cur.close()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Region not found")

    secret = row[3]
    if not secret:
        # Generate new secret if missing
        secret = f"edge_sec_{secrets.token_hex(16)}"
        cur = await db.execute("UPDATE regions SET node_secret = %s WHERE code = %s", (secret, code))
        await cur.close()

    base_url = settings.PUBLIC_BASE_URL.rstrip("/")
    cmd = (
        f"curl -sSL {base_url}/edge/setup.sh | bash -s -- "
        f"--controller {base_url} "
        f"--token {secret} "
        f"--region {code}"
    )

    domain = f"{code}.{settings.TUNNEL_DOMAIN}"
    cf_instructions = {
        "ssh_record": {"name": f"{code}.ssh", "type": "A", "target": row[2], "proxied": False},
        "web_record": {"name": f"*.{code}", "type": "A", "target": row[2], "proxied": True},
    }

    return {
        "code": code,
        "name": row[1],
        "server_ip": row[2],
        "node_secret": secret,
        "command": cmd,
        "cloudflare_dns": cf_instructions,
    }
