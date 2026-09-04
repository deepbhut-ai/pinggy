"""Users router: list/get/update/delete (admin-only)."""
import asyncio
import socket
import secrets as _secrets

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user, get_api_user
from app.core.security import hash_password
from app.schemas.auth import UserOut

router = APIRouter(prefix="/users", tags=["users"])

# The server IP that custom domain A records must point to
_SERVER_IP = "13.140.131.204"


async def _verify_domain_dns(domain: str) -> dict:
    """Verify a custom domain by making an actual HTTP request to it.

    If the domain is correctly configured (DNS → Cloudflare → our server),
    the request will reach our FastAPI app and we can check the response.
    """
    import httpx

    try:
        # Make an actual HTTP request to the domain — if DNS + Cloudflare + nginx
        # are all set up correctly, this request reaches our server.
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            try:
                resp = await client.get(f"http://{domain}/health")
                # If we get a response from our server, the domain is configured
                if resp.status_code == 200:
                    try:
                        body = resp.json()
                        if body.get("status") == "ok":
                            return {"dns_resolves": True, "pointed_ip": domain, "status": "ok",
                                    "message": f"✅ Domain verified — {domain} is correctly configured and reaching this server"}
                    except Exception:
                        pass
                return {"dns_resolves": True, "pointed_ip": domain, "status": "error",
                        "message": f"⚠️ {domain} responded with HTTP {resp.status_code}, but its health check is not healthy"}
            except httpx.ConnectError:
                return {"dns_resolves": False, "pointed_ip": None, "status": "no_dns",
                        "message": f"⚠️ {domain} is not configured — no DNS record found. Add an A record pointing to 13.140.131.204 (or proxy via Cloudflare)"}
            except httpx.ConnectTimeout:
                return {"dns_resolves": False, "pointed_ip": None, "status": "timeout",
                        "message": f"⚠️ {domain} DNS resolves but connection timed out — check Cloudflare proxy settings (SSL mode: Flexible)"}
            except httpx.HTTPStatusError as e:
                return {"dns_resolves": True, "pointed_ip": domain, "status": "ok",
                        "message": f"✅ Domain verified — {domain} reached the server (HTTP {e.response.status_code})"}
            except Exception as e:
                # Check if it's a DNS resolution failure
                err_str = str(e).lower()
                if "name or service not known" in err_str or "nodename nor servname" in err_str or "getaddrinfo" in err_str:
                    return {"dns_resolves": False, "pointed_ip": None, "status": "no_dns",
                            "message": f"⚠️ {domain} is not configured — no DNS record found. Add an A record pointing to 13.140.131.204 (or proxy via Cloudflare)"}
                if "timed out" in err_str or "timeout" in err_str:
                    return {"dns_resolves": False, "pointed_ip": None, "status": "timeout",
                            "message": f"⚠️ {domain} DNS resolves but connection timed out — check Cloudflare proxy settings (SSL mode: Flexible)"}
                return {"dns_resolves": False, "pointed_ip": None, "status": "error",
                        "message": f"⚠️ Could not verify {domain}: {e}"}
    except Exception as e:
        return {"dns_resolves": False, "pointed_ip": None, "status": "error",
                "message": f"Could not verify DNS: {e}"}


@router.get("", response_model=list[UserOut])
async def list_users(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    cur = await db.execute(
        "SELECT id, email, full_name, role, tunnel_token, custom_domain, plan, seats, plan_expires_at, is_active FROM users ORDER BY created_at DESC LIMIT %s OFFSET %s",
        (limit, offset),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [UserOut(id=str(r[0]), email=r[1], full_name=r[2], role=r[3], tunnel_token=r[4], custom_domain=r[5], plan=r[6], seats=int(r[7] or 1), plan_expires_at=r[8].isoformat() if r[8] else None, is_active=r[9]) for r in rows]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "SELECT id, email, full_name, role, tunnel_token, custom_domain, plan, seats, plan_expires_at, is_active FROM users WHERE id = %s", (user_id,)
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return UserOut(id=str(row[0]), email=row[1], full_name=row[2], role=row[3], tunnel_token=row[4], custom_domain=row[5], plan=row[6], seats=int(row[7] or 1), plan_expires_at=row[8].isoformat() if row[8] else None, is_active=row[9])


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    email: str | None = None,
    full_name: str | None = None,
    role: str | None = None,
    password: str | None = None,
    custom_domain: str | None = None,
    plan: str | None = None,
    duration_days: int | None = None,
    seats: int | None = None,
    is_active: bool | None = None,
):
    """Update a user (admin only). Can change email, name, role, password, custom domain, plan, or account status."""
    # Check user exists
    cur = await db.execute("SELECT id FROM users WHERE id = %s", (user_id,))
    if not await cur.fetchone():
        await cur.close()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await cur.close()

    # Build update query dynamically
    updates = []
    params = []
    if email:
        updates.append("email = %s")
        params.append(email)
    if full_name:
        updates.append("full_name = %s")
        params.append(full_name)
    if role and role in ("admin", "user"):
        updates.append("role = %s")
        params.append(role)
    if password:
        updates.append("password_hash = %s")
        params.append(hash_password(password))
    if plan and plan in ("free", "pro"):
        updates.append("plan = %s")
        params.append(plan)
        # Handle expiry: activating pro extends from now (or current expiry if still active)
        # duration_days param controls how long; deactivating (free) clears expiry
        if plan == "pro":
            days = duration_days if (duration_days and duration_days > 0) else 30
            updates.append(
                "plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + make_interval(days => %s)"
            )
            params.append(days)
        else:
            updates.append("plan_expires_at = NULL")
    if seats and seats > 0:
        updates.append("seats = %s")
        params.append(seats)
        # Auto-upgrade/downgrade plan based on seat count (unless plan was
        # explicitly set above).  2+ seats → Pro (30-day expiry), 1 seat → Free.
        if not plan:
            if seats >= 2:
                updates.append("plan = 'pro'")
                updates.append(
                    "plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + make_interval(days => 30)"
                )
            elif seats == 1:
                updates.append("plan = 'free'")
                updates.append("plan_expires_at = NULL")
    if is_active is not None:
        updates.append("is_active = %s")
        params.append(is_active)
    if custom_domain is not None:
        domain_value = custom_domain.strip() if custom_domain else None
        # Check if domain is already taken by another user
        if domain_value:
            cd = domain_value.lower()
            # Restrict *.iraglobaltech.com to admin and support only
            if cd.endswith(".iraglobaltech.com") or cd == "iraglobaltech.com":
                allowed = admin.get("role") == "admin" or admin.get("email") == "support@iraglobaltech.com"
                if not allowed:
                    raise HTTPException(
                        status.HTTP_403_FORBIDDEN,
                        "Subdomains of iraglobaltech.com can only be set by admin or support@iraglobaltech.com.",
                    )
            cur = await db.execute(
                "SELECT email FROM users WHERE custom_domain = %s AND id != %s",
                (domain_value, user_id),
            )
            existing = await cur.fetchone()
            await cur.close()
            if existing:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Domain '{domain_value}' is already in use by another user ({existing[0]}). Please choose a different domain.",
                )
        updates.append("custom_domain = %s")
        params.append(domain_value)

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    params.append(user_id)
    try:
        cur = await db.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE id = %s "
            f"RETURNING id, email, full_name, role, tunnel_token, custom_domain, plan, seats, plan_expires_at, is_active",
            tuple(params),
        )
        row = await cur.fetchone()
        await cur.close()
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This custom domain is already in use by another user. Please choose a different domain.",
            )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to update user: {str(e)}")
    # Audit: record which fields an admin changed (never the password value itself)
    changed = [k for k, v in {
        "email": email, "full_name": full_name, "role": role,
        "password": "***" if password else None,
        "custom_domain": custom_domain, "plan": plan,
        "duration_days": duration_days if plan == "pro" else None,
        "seats": seats, "is_active": is_active,
    }.items() if v is not None and v != ""]
    await log_audit(db, admin["email"], "user.update", row[1], ", ".join(changed) or "no fields")
    return UserOut(id=str(row[0]), email=row[1], full_name=row[2], role=row[3], tunnel_token=row[4], custom_domain=row[5], plan=row[6], seats=int(row[7] or 1), plan_expires_at=row[8].isoformat() if row[8] else None, is_active=row[9])


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete a user (admin only). Cannot delete yourself."""
    if user_id == admin["id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete your own account")

    cur = await db.execute("SELECT email FROM users WHERE id = %s", (user_id,))
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # Delete user's tunnels from DB
    cur = await db.execute("DELETE FROM tunnels WHERE user_email = %s", (row[0],))
    await cur.close()

    # Delete user
    cur = await db.execute("DELETE FROM users WHERE id = %s", (user_id,))
    await cur.close()
    await log_audit(db, admin["email"], "user.delete", row[0], "user and their tunnels removed")

    return {"message": f"User {row[0]} deleted"}


@router.put("/me/custom-domain")
async def update_my_custom_domain(
    custom_domain: str | None = None,
    token_id: str | None = None,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update the current user's custom domain. Available to any logged-in user.

    v1.7.1: the domain is ALSO assigned to a tunnel token (tokens.custom_domain)
    — that is what SSH banner, Host-header routing and tunnel URLs actually read.
    token_id optional: defaults to the user's most recent token without a domain.
    Clearing (empty string) removes the domain from the user AND all their tokens.
    """
    # Allow empty string to clear the domain
    domain_value = custom_domain.strip().lower() if custom_domain else None

    # Check if domain is already taken by another user
    if domain_value:
        if (user.get("plan") or "free") != "pro":
            cur = await db.execute(
                "SELECT COUNT(*) FROM tokens WHERE user_email = %s AND custom_domain IS NOT NULL AND custom_domain != %s",
                (user["email"], domain_value),
            )
            if (await cur.fetchone())[0] > 0:
                await cur.close()
                raise HTTPException(
                    status.HTTP_402_PAYMENT_REQUIRED,
                    "Free plan allows only 1 custom domain. Upgrade to Pro to attach more domains.",
                )
            await cur.close()
        cur = await db.execute(
            "SELECT email FROM users WHERE custom_domain = %s AND id != %s",
            (domain_value, user["id"]),
        )
        existing = await cur.fetchone()
        await cur.close()
        if existing:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Domain '{domain_value}' is already in use by another user ({existing[0]}). Please choose a different domain.",
            )

    try:
        cur = await db.execute(
            "UPDATE users SET custom_domain = %s, updated_at = now() WHERE id = %s RETURNING custom_domain",
            (domain_value, user["id"]),
        )
        row = await cur.fetchone()
        await cur.close()
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Domain '{domain_value}' is already in use by another user. Please choose a different domain.",
            )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to update custom domain: {str(e)}")

    # ---- v1.7.1: propagate to tokens (what the tunnel system actually reads) ----
    attached_token = None
    if not domain_value:
        # clear from ALL of the user's tokens
        cur = await db.execute(
            "UPDATE tokens SET custom_domain = NULL, updated_at = now() WHERE user_email = %s AND custom_domain IS NOT NULL",
            (user["email"],),
        )
        await cur.close()
    else:
        # remove the domain from any other owner's token (defensive; users-unique check should catch first)
        cur = await db.execute(
            "UPDATE tokens SET custom_domain = NULL, updated_at = now() WHERE custom_domain = %s AND user_email != %s",
            (domain_value, user["email"]),
        )
        await cur.close()
        # remove it from the user's OTHER tokens (a domain routes to exactly one token)
        cur = await db.execute(
            "UPDATE tokens SET custom_domain = NULL, updated_at = now() WHERE custom_domain = %s AND user_email = %s",
            (domain_value, user["email"]),
        )
        await cur.close()
        # v1.8.0: promote to primary — drop it from token_domains anywhere (one domain, one meaning)
        cur = await db.execute("DELETE FROM token_domains WHERE domain = %s", (domain_value,))
        await cur.close()
        # pick target token: given token_id, else most recent without a domain
        target = None
        if token_id:
            cur = await db.execute(
                "SELECT id FROM tokens WHERE id = %s AND user_email = %s",
                (token_id, user["email"]),
            )
            target = await cur.fetchone()
            await cur.close()
            if not target:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found (or not yours)")
        else:
            cur = await db.execute(
                "SELECT id FROM tokens WHERE user_email = %s ORDER BY (custom_domain IS NULL) DESC, created_at DESC LIMIT 1",
                (user["email"],),
            )
            target = await cur.fetchone()
            await cur.close()
        if target:
            try:
                cur = await db.execute(
                    "UPDATE tokens SET custom_domain = %s, updated_at = now() WHERE id = %s RETURNING id",
                    (domain_value, target[0]),
                )
                r = await cur.fetchone()
                await cur.close()
                attached_token = str(r[0]) if r else None
            except Exception as e:
                if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                    raise HTTPException(
                        status.HTTP_409_CONFLICT,
                        f"Domain '{domain_value}' is already attached to another token.",
                    )
                raise
        from app.core.audit import log_audit
        await log_audit(db, user["email"], "user.custom_domain", domain_value or "", f"token={attached_token}")

    # Verify DNS configuration for the saved domain
    dns_status = None
    if domain_value:
        dns_status = await _verify_domain_dns(domain_value)

    return {"custom_domain": row[0], "token_id": attached_token, "dns_status": dns_status}


@router.get("/me/verify-domain")
async def verify_my_domain_dns(
    domain: str,
    user: dict = Depends(get_api_user),
):
    """Check if a custom domain's DNS A record points to our server.
    Can be called anytime to re-verify without saving."""
    dns_status = await _verify_domain_dns(domain.strip().lower())
    return {"domain": domain.strip().lower(), **dns_status}


@router.get("/{user_id}/tunnels")
async def get_user_tunnels(
    user_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get all tunnels for a specific user (admin only)."""
    # Get user email
    cur = await db.execute("SELECT email FROM users WHERE id = %s", (user_id,))
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # Get tunnels from DB
    cur = await db.execute(
        "SELECT tunnel_id, subdomain, remote_port, local_port, protocol, "
        "user_email, ssh_peer, status, request_count, bytes_transferred, created_at "
        "FROM tunnels WHERE user_email = %s ORDER BY created_at DESC",
        (row[0],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [
        {
            "tunnel_id": r[0],
            "subdomain": r[1],
            "url": f"https://{r[1]}.iraglobaltech.com" if r[1] else "",
            "remote_port": r[2],
            "local_port": r[3],
            "protocol": r[4],
            "user_email": r[5] or "",
            "ssh_peer": r[6] or "",
            "status": r[7],
            "request_count": r[8],
            "bytes_transferred": r[9],
            "created_at": r[10].isoformat() if r[10] else "",
        }
        for r in rows
    ]