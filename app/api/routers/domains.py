"""Custom Domains & Automated SSL API Router."""
import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from psycopg import AsyncConnection

from app.core.audit import log_audit
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_api_user
from app.core.ssl_manager import (
    deprovision_ssl_for_domain,
    get_ssl_status,
    provision_ssl_for_domain,
    run_certbot_renewal,
    verify_domain_dns,
)

logger = logging.getLogger("domains_router")

router = APIRouter(prefix="/domains", tags=["domains"])


class DomainRequest(BaseModel):
    domain: str = Field(..., min_length=3, max_length=255)


class VerifyAndSaveRequest(BaseModel):
    domain: str = Field(..., min_length=3, max_length=255)
    name: str | None = None
    token_id: str | None = None


@router.get("/verify-dns")
async def check_domain_dns(
    domain: str,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    """Check if a custom domain's DNS A record points to our server IP."""
    d = domain.strip().lower()
    res = await verify_domain_dns(d)
    return {"domain": d, **res}


@router.get("/ssl-status")
async def check_ssl_status(
    domain: str,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    """Inspect current Let's Encrypt certificate and Nginx virtual host status."""
    d = domain.strip().lower()
    return await get_ssl_status(d)


@router.post("/provision-ssl")
async def provision_domain_ssl(
    body: DomainRequest,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    """Manually trigger or retry Let's Encrypt SSL issuance and Nginx activation for a domain."""
    d = body.domain.strip().lower()
    res = await provision_ssl_for_domain(d, email=user.get("email"))
    if res["status"] != "ok":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.get("message", "SSL provisioning failed"),
        )
    return res


@router.post("/renew-all-ssl")
async def trigger_ssl_renew_all(
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    """Trigger an immediate SSL certificate renewal pass for all certificates."""
    return await run_certbot_renewal()



@router.post("/verify-and-save")
async def verify_and_save_domain(
    body: VerifyAndSaveRequest,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
) -> dict[str, Any]:
    """Full Step-by-Step Flow (from Doc/ssl.md):
    1. Verify DNS A record.
    2. Obtain SSL cert via Certbot webroot.
    3. Generate Nginx config + symlink.
    4. Graceful Nginx reload (zero downtime).
    5. Save domain to database tokens.
    """
    domain = body.domain.strip().lower()
    from app.api.routers.tokens import _validate_custom_domain, _enforce_free_domain_limit, _generate_token, _subdomain_from_token

    # 1. Validate domain ownership / plan rules
    domain = _validate_custom_domain(domain, user)

    # Check if domain already registered to another token
    cur = await db.execute("SELECT id, user_email FROM tokens WHERE custom_domain = %s", (domain,))
    existing = await cur.fetchone()
    await cur.close()
    if existing:
        if existing[1] != user["email"]:
            raise HTTPException(status.HTTP_409_CONFLICT, "Domain is already in use by another account.")

    cur = await db.execute("SELECT token_id FROM token_domains WHERE domain = %s", (domain,))
    existing_extra = await cur.fetchone()
    await cur.close()
    if existing_extra:
        raise HTTPException(status.HTTP_409_CONFLICT, "Domain is already attached as a secondary domain.")

    await _enforce_free_domain_limit(db, user["email"], candidate_domain=domain)

    # 2. Verify DNS
    dns_res = await verify_domain_dns(domain)
    if dns_res["status"] != "ok":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=dns_res.get("message", f"DNS verification failed for {domain}"),
        )

    # 3. Provision SSL & Configure Nginx
    ssl_res = await provision_ssl_for_domain(domain, email=user.get("email"), skip_dns_check=True)
    if ssl_res["status"] != "ok":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ssl_res.get("message", "Failed to issue SSL certificate with Let's Encrypt"),
        )

    # 4. Save to database (attach to existing token or create new one)
    token_id = body.token_id
    if token_id:
        cur = await db.execute(
            "UPDATE tokens SET custom_domain = %s, updated_at = now() WHERE id = %s AND user_email = %s RETURNING id, token",
            (domain, token_id, user["email"]),
        )
        saved = await cur.fetchone()
        await cur.close()
        if not saved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Specified token not found.")
    else:
        # Create a new token for this root domain
        token_str = _generate_token()
        fixed_sub = _subdomain_from_token(token_str)
        token_name = body.name or domain
        cur = await db.execute(
            """
            INSERT INTO tokens (user_email, token, name, custom_domain, fixed_subdomain)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, token
            """,
            (user["email"], token_str, token_name, domain, fixed_sub),
        )
        saved = await cur.fetchone()
        await cur.close()

    await log_audit(db, user["email"], "domain.provision_ssl", domain, f"token_id={saved[0] if saved else ''}")

    return {
        "status": "ok",
        "domain": domain,
        "token_id": str(saved[0]) if saved else None,
        "https_url": f"https://{domain}",
        "ssl": ssl_res,
        "message": f"🎉 {domain} verified, SSL certificate installed, and domain activated!",
    }


@router.delete("/{domain}")
async def delete_and_deprovision_domain(
    domain: str,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
) -> dict[str, Any]:
    """Remove a custom domain, delete its Nginx config, gracefully reload Nginx, and clean up certbot cert."""
    domain = domain.strip().lower()

    # Verify user owns this domain
    cur = await db.execute(
        "SELECT id FROM tokens WHERE custom_domain = %s AND user_email = %s",
        (domain, user["email"]),
    )
    primary_row = await cur.fetchone()
    await cur.close()

    cur = await db.execute(
        """
        SELECT td.id FROM token_domains td
        JOIN tokens t ON t.id = td.token_id
        WHERE td.domain = %s AND t.user_email = %s
        """,
        (domain, user["email"]),
    )
    extra_row = await cur.fetchone()
    await cur.close()

    if not primary_row and not extra_row and user.get("role") != "admin":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domain not found or not owned by you.")

    # Remove from DB
    if primary_row:
        cur = await db.execute(
            "UPDATE tokens SET custom_domain = NULL, updated_at = now() WHERE id = %s",
            (primary_row[0],),
        )
        await cur.close()

    if extra_row:
        cur = await db.execute("DELETE FROM token_domains WHERE id = %s", (extra_row[0],))
        await cur.close()

    # Deprovision SSL & Nginx config
    deprovision_res = await deprovision_ssl_for_domain(domain)
    await log_audit(db, user["email"], "domain.deprovision_ssl", domain, "")

    return {
        "status": "ok",
        "message": f"{domain} removed and SSL configuration cleaned up.",
        "details": deprovision_res,
    }
