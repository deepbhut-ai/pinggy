"""Token management router — CRUD for tunnel tokens.

Each user can have multiple tokens, each creating a separate tunnel
with its own subdomain and optional custom domain.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user, get_api_user
from app.core.ssl_manager import deprovision_ssl_for_domain

router = APIRouter(prefix="/tokens", tags=["tokens"])


class TokenOut(BaseModel):
    id: str
    token: str
    name: str | None = None
    custom_domain: str | None = None
    subdomain: str | None = None
    created_at: str | None = None
    total_requests: int = 0
    total_bytes: int = 0
    active_tunnels: int = 0
    fixed_subdomain: str | None = None
    tunnel_mode: str | None = None
    tcp_port: int | None = None
    domains: list[str] = []  # extra custom domains (v1.4.0; custom_domain is primary)
    team_id: str | None = None        # v1.7.0 — token assigned to this team
    via_team: dict | None = None      # v1.7.0 — set when listing a team-shared token I don't own
    security: dict | None = None  # masked security view (never returns basic_auth_pass / full bearer when set)
    created_by_api_key: str | None = None  # v2.6.4 — which API key created this token (None = dashboard)


async def _token_traffic(db: AsyncConnection, token: str) -> tuple[int, int, int]:
    """Aggregate (total_requests, total_bytes, active_tunnels) for one token's tunnels."""
    cur = await db.execute(
        "SELECT COALESCE(SUM(request_count),0), COALESCE(SUM(bytes_transferred),0), "
        "COUNT(*) FILTER (WHERE status = 'active') "
        "FROM tunnels WHERE token = %s",
        (token,),
    )
    row = await cur.fetchone()
    await cur.close()
    return int(row[0]), int(row[1]), int(row[2])


class TokenCreate(BaseModel):
    name: str = Field(default="New Token", max_length=120)
    custom_domain: str | None = Field(default=None, max_length=255)
    fixed_subdomain: str | None = Field(default=None, max_length=50)  # permanent subdomain at creation time


class TokenUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    custom_domain: str | None = None
    fixed_subdomain: str | None = Field(default=None, max_length=50)
    tunnel_mode: str | None = None       # http | tcp (v1.0.0, Pro)
    tcp_port: int | None = Field(default=None, ge=1024, le=65535)
    basic_auth_user: str | None = Field(default=None, max_length=120)
    basic_auth_pass: str | None = Field(default=None, max_length=120)
    ip_whitelist: str | None = None
    bearer_key: str | None = Field(default=None, max_length=64)
    https_only: bool | None = None


def _generate_token() -> str:
    return secrets.token_hex(8)  # 16-char hex string


def _subdomain_from_token(token: str) -> str:
    import hashlib
    return hashlib.md5(token.encode()).hexdigest()[:7]


def _validate_custom_domain(domain: str, user: dict) -> str:
    """Validate and normalize a custom domain.

    Only admin and support@iraglobaltech.com can use *.iraglobaltech.com subdomains.
    """
    cd = domain.strip().lower()
    # Restrict *.iraglobaltech.com to admin and support only
    if cd.endswith(".iraglobaltech.com") or cd == "iraglobaltech.com":
        allowed = user.get("role") == "admin" or user.get("email") == "support@iraglobaltech.com"
        if not allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Subdomains of iraglobaltech.com can only be set by admin or support@iraglobaltech.com.",
            )
    return cd


def _root_domain(domain: str) -> str:
    """Return the root domain (last two labels) for a hostname.

    Examples:
      serverira.com -> serverira.com
      acelle.callingagents.in -> callingagents.in
      abc.iraglobaltech.com -> iraglobaltech.com
    """
    d = domain.strip().lower().rstrip(".")
    parts = d.split(".")
    if len(parts) <= 2:
        return d
    return ".".join(parts[-2:])


def _is_subdomain_under(domain: str, parent: str) -> bool:
    """True if domain is a subdomain of parent (or equal to parent)."""
    d = domain.strip().lower().rstrip(".")
    p = parent.strip().lower().rstrip(".")
    return d == p or d.endswith("." + p)


def _is_root_custom_domain(domain: str, tunnel_domain: str) -> bool:
    """True if this domain is a root domain the user owns, not a subdomain under another domain or the tunnel domain."""
    d = domain.strip().lower().rstrip(".")
    if not d:
        return False
    if _is_subdomain_under(d, tunnel_domain):
        return False
    return _root_domain(d) == d


async def _user_owns_root_domain(db: AsyncConnection, user_email: str, domain: str, tunnel_domain: str) -> bool:
    """Return True if the user has a token for the root domain of the given domain."""
    rd = _root_domain(domain)
    # Root domain itself always passes
    if rd == domain.strip().lower().rstrip("."):
        return True
    # Tunnel-domain subdomains don't need root ownership
    if _is_subdomain_under(domain, tunnel_domain):
        return True
    cur = await db.execute(
        "SELECT 1 FROM tokens WHERE user_email = %s AND custom_domain = %s LIMIT 1",
        (user_email, rd),
    )
    row = await cur.fetchone()
    await cur.close()
    return bool(row)


async def _enforce_root_domain_ownership(db: AsyncConnection, user: dict, domain: str) -> None:
    """Reject subdomain creation if the user hasn't registered the root domain first."""
    from app.core.config import settings
    d = domain.strip().lower().rstrip(".")
    if not d:
        return
    # Root domains and tunnel-domain subdomains are exempt
    rd = _root_domain(d)
    if rd == d or _is_subdomain_under(d, settings.TUNNEL_DOMAIN):
        return
    if not await _user_owns_root_domain(db, user["email"], d, settings.TUNNEL_DOMAIN):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"You must register the root domain '{rd}' before creating subdomains under it.",
        )


async def _enforce_free_domain_limit(db: AsyncConnection, user_email: str, *, candidate_domain: str | None = None, ignore_token_id: str | None = None) -> None:
    """Free plan: exactly one root custom domain across all tokens for this user."""
    from app.core.config import settings
    cur = await db.execute(
        "SELECT id, custom_domain FROM tokens WHERE user_email = %s AND custom_domain IS NOT NULL",
        (user_email,),
    )
    rows = await cur.fetchall()
    await cur.close()
    if ignore_token_id:
        rows = [r for r in rows if str(r[0]) != str(ignore_token_id)]
    # Count only root custom domains (not subdomains under another domain or the tunnel domain)
    root_domains = {_root_domain(str(r[1])) for r in rows if _is_root_custom_domain(str(r[1]), settings.TUNNEL_DOMAIN)}
    if candidate_domain and _is_root_custom_domain(candidate_domain, settings.TUNNEL_DOMAIN):
        root_domains.add(_root_domain(candidate_domain))
    if len(root_domains) <= 1:
        return
    raise HTTPException(
        status.HTTP_402_PAYMENT_REQUIRED,
        "Free plan allows only 1 custom domain. Upgrade to Pro to attach more domains.",
    )


@router.get("", response_model=list[TokenOut])
async def list_tokens(
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all tokens for the current user (own + tokens shared via teams, v1.7.0)."""
    cur = await db.execute(
        "SELECT id, token, name, custom_domain, created_at, basic_auth_user, ip_whitelist, bearer_key, https_only, fixed_subdomain, tunnel_mode, tcp_port, team_id, user_email, created_by_api_key FROM tokens WHERE user_email = %s ORDER BY created_at DESC",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    seen = {str(r[0]) for r in rows}
    # v1.7.0 — tokens shared with me through team membership (I'm not the owner)
    cur = await db.execute(
        """SELECT t.id, t.token, t.name, t.custom_domain, t.created_at, t.basic_auth_user, t.ip_whitelist,
                  t.bearer_key, t.https_only, t.fixed_subdomain, t.tunnel_mode, t.tcp_port, t.team_id, t.user_email, tm.role, te.name
           FROM tokens t
           JOIN team_members tm ON tm.team_id = t.team_id AND tm.user_email = %s
           JOIN teams te ON te.id = t.team_id
           WHERE t.user_email != %s""",
        (user["email"], user["email"]),
    )
    shared = await cur.fetchall()
    await cur.close()

    out = []
    for r in rows:
        req, byt, act = await _token_traffic(db, r[1])
        # extra domains (v1.4.0)
        cur = await db.execute("SELECT domain FROM token_domains WHERE token_id = %s ORDER BY created_at", (r[0],))
        doms = [d[0] for d in await cur.fetchall()]
        await cur.close()
        via = None
        if r[12]:
            cur = await db.execute("SELECT name FROM teams WHERE id = %s", (r[12],))
            tn = await cur.fetchone()
            await cur.close()
            via = {"team_id": str(r[12]), "team_name": tn[0] if tn else "", "owner": True}
        out.append(TokenOut(
            id=str(r[0]),
            token=r[1],
            name=r[2],
            custom_domain=r[3],
            subdomain=r[9] or _subdomain_from_token(r[1]),
            created_at=r[4].isoformat() if r[4] else None,
            total_requests=req,
            total_bytes=byt,
            active_tunnels=act,
            fixed_subdomain=r[9],
            tunnel_mode=r[10],
            tcp_port=r[11],
            domains=doms,
            team_id=str(r[12]) if r[12] else None,
            via_team=via,
            security={
                "basic_auth_user": r[5],
                "ip_whitelist": r[6],
                "bearer_key": "***set***" if r[7] else None,
                "https_only": r[8],
            },
            created_by_api_key=str(r[14]) if r[14] else None,
        ))
    # shared team tokens — read-only view for plain members; admins/owner get manage rights via guards
    for r in shared:
        if str(r[0]) in seen:
            continue
        cur = await db.execute("SELECT domain FROM token_domains WHERE token_id = %s ORDER BY created_at", (r[0],))
        doms = [d[0] for d in await cur.fetchall()]
        await cur.close()
        req, byt, act = await _token_traffic(db, r[1])
        out.append(TokenOut(
            id=str(r[0]),
            token=r[1],
            name=f"{r[2]} (shared)",
            custom_domain=r[3],
            subdomain=r[9] or _subdomain_from_token(r[1]),
            created_at=r[4].isoformat() if r[4] else None,
            total_requests=req,
            total_bytes=byt,
            active_tunnels=act,
            fixed_subdomain=r[9],
            tunnel_mode=r[10],
            tcp_port=r[11],
            domains=doms,
            team_id=str(r[12]) if r[12] else None,
            via_team={"team_id": str(r[12]), "team_name": r[15], "owner": False, "my_role": r[14], "owner_email": r[13]},
            security={
                "basic_auth_user": r[5],
                "ip_whitelist": r[6],
                "bearer_key": "***set***" if r[7] else None,
                "https_only": r[8],
            },
        ))
    return out


@router.post("", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def create_token(
    body: TokenCreate,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a new token for the current user.
    Domain-token limit = seats (Free = 1, Pro = seats purchased).
    Subdomain-only tokens (no custom_domain) are unlimited for Pro users."""
    has_domain = bool(body.custom_domain and body.custom_domain.strip())
    if has_domain:
        # Only root custom domains count against the seat limit (subdomains under another domain don't)
        from app.core.config import settings
        max_tokens = int(user.get("seats") or 1)
        cur = await db.execute(
            "SELECT custom_domain FROM tokens WHERE user_email = %s AND custom_domain IS NOT NULL",
            (user["email"],),
        )
        rows = await cur.fetchall()
        await cur.close()
        root_domains = {_root_domain(str(r[0])) for r in rows if _is_root_custom_domain(str(r[0]), settings.TUNNEL_DOMAIN)}
        if _is_root_custom_domain(body.custom_domain, settings.TUNNEL_DOMAIN):
            root_domains.add(_root_domain(body.custom_domain))
        if len(root_domains) > max_tokens:
            if (user.get("plan") or "free") == "free":
                raise HTTPException(
                    status.HTTP_402_PAYMENT_REQUIRED,
                    f"Free plan allows only 1 custom domain. Upgrade to Pro for more.",
                )
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                f"You've reached your limit of {max_tokens} custom domains (seats). "
                "Buy more seats under Plan → Upgrade to create additional domain tokens.",
            )

    # Validate custom_domain uniqueness if provided
    custom_domain = None
    if body.custom_domain:
        cd = _validate_custom_domain(body.custom_domain, user)
        # Enforce root-domain ownership for subdomains under custom domains
        await _enforce_root_domain_ownership(db, user, cd)
        if (user.get("plan") or "free") != "pro":
            await _enforce_free_domain_limit(db, user["email"], candidate_domain=cd)
        if cd:
            cur = await db.execute(
                "SELECT id FROM tokens WHERE custom_domain = %s", (cd,)
            )
            if await cur.fetchone():
                await cur.close()
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Domain '{cd}' is already in use by another token.",
                )
            await cur.close()
            custom_domain = cd

    # v1: optional fixed subdomain at creation — validate uniqueness
    fixed_sub = None
    if body.fixed_subdomain:
        fixed_sub = body.fixed_subdomain.strip().lower()
        if not all(c.isalnum() for c in fixed_sub):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Subdomain can only contain letters and numbers")
        cur = await db.execute("SELECT id FROM tokens WHERE fixed_subdomain = %s", (fixed_sub,))
        if await cur.fetchone():
            await cur.close()
            raise HTTPException(status.HTTP_409_CONFLICT, f"Subdomain '{fixed_sub}' is already taken. Choose another one.")
        await cur.close()

    token = _generate_token()
    api_key_id = user.get("api_key_id")
    cur = await db.execute(
        "INSERT INTO tokens (user_email, token, name, custom_domain, fixed_subdomain, created_by_api_key) "
        "VALUES (%s, %s, %s, %s, %s, %s) "
        "RETURNING id, token, name, custom_domain, fixed_subdomain, created_at",
        (user["email"], token, body.name, custom_domain, fixed_sub, api_key_id),
    )
    row = await cur.fetchone()
    await cur.close()
    return TokenOut(
        id=str(row[0]),
        token=row[1],
        name=row[2],
        custom_domain=row[3],
        subdomain=row[4] or _subdomain_from_token(row[1]),
        fixed_subdomain=row[4],
        created_at=row[5].isoformat() if row[5] else None,
    )


# ---- Team assignment (v1.7.0 role control) ----


async def _token_manage_role(db: AsyncConnection, token_id: str, user: dict) -> str | None:
    """What right does `user` have over this token? 'owner' (token owner),
    'team_owner'/'team_admin' (via assigned team), 'member' (read-only), None."""
    cur = await db.execute("SELECT user_email, team_id FROM tokens WHERE id = %s", (token_id,))
    t = await cur.fetchone()
    await cur.close()
    if not t:
        return None
    if t[0] == user["email"] or user["role"] == "admin":
        return "owner"
    if t[1]:
        from app.api.routers.teams import get_team_role
        role = await get_team_role(db, str(t[1]), user["email"])
        if role == "owner":
            return "team_owner"
        if role == "admin":
            return "team_admin"
        if role == "member":
            return "member"
    return None


class TeamAssignIn(BaseModel):
    team_id: str | None = None  # null = unassign


@router.put("/{token_id}/team")
async def assign_token_to_team(
    token_id: str,
    body: TeamAssignIn,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Assign/unassign a token to a team. Requires: token owner, or team owner/admin (to pull in / release a member-shared token)."""
    cur = await db.execute("SELECT user_email FROM tokens WHERE id = %s", (token_id,))
    t = await cur.fetchone()
    await cur.close()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    from app.api.routers.teams import get_team_role
    if body.team_id:
        role = await get_team_role(db, body.team_id, user["email"])
        if role not in ("owner", "admin"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the team owner or an admin can assign tokens to the team")
        if t[0] != user["email"] and role != "owner":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the team owner can share another user's token")
        cur = await db.execute("UPDATE tokens SET team_id = %s WHERE id = %s RETURNING team_id", (body.team_id, token_id))
    else:
        right = await _token_manage_role(db, token_id, user)
        if right not in ("owner", "team_owner", "team_admin"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the token owner or a team admin can unassign")
        cur = await db.execute("UPDATE tokens SET team_id = NULL WHERE id = %s RETURNING id", (token_id,))
    r = await cur.fetchone()
    await cur.close()
    await log_audit(db, user["email"], "token.team_assign", token_id[:8], f"team={body.team_id}")
    return {"token_id": token_id, "team_id": body.team_id}


@router.put("/{token_id}", response_model=TokenOut)
async def update_token(
    token_id: str,
    body: TokenUpdate,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update a token's name, custom domain, or security options (v0.8.0).
    v1.7.0: token owner, team owner, and team admins may edit; plain team members are read-only."""
    # Verify manage right (v1.7.0 team-aware)
    right = await _token_manage_role(db, token_id, user)
    if right is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    if right == "member":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Read-only: this token is shared with your team — ask a team admin or the owner to change it")

    updates = []
    params = []
    if body.name is not None:
        updates.append("name = %s")
        params.append(body.name)
    if body.custom_domain is not None:
        domain_value = body.custom_domain.strip() if body.custom_domain else None
        # Check if domain is already taken by another token
        if domain_value:
            domain_value = _validate_custom_domain(domain_value, user)
            # Enforce root-domain ownership for subdomains under custom domains
            await _enforce_root_domain_ownership(db, user, domain_value)
            if (user.get("plan") or "free") != "pro":
                await _enforce_free_domain_limit(db, user["email"], candidate_domain=domain_value, ignore_token_id=token_id)
            cur = await db.execute(
                "SELECT id FROM tokens WHERE custom_domain = %s AND id != %s",
                (domain_value, token_id),
            )
            if await cur.fetchone():
                await cur.close()
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Domain '{domain_value}' is already in use by another token.",
                )
            await cur.close()
        updates.append("custom_domain = %s")
        params.append(domain_value)
    # ---- fixed subdomain (v0.9.0): stable URL per token ----
    if body.fixed_subdomain is not None:
        import re as _re
        sub = body.fixed_subdomain.strip().lower() or None
        if sub:
            if not _re.fullmatch(r"[a-z0-9][a-z0-9-]{2,49}", sub):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "Subdomain must be 3-50 chars: letters, digits, hyphens (no leading hyphen).",
                )
            cur = await db.execute(
                "SELECT id FROM tokens WHERE fixed_subdomain = %s AND id != %s",
                (sub, token_id),
            )
            if await cur.fetchone():
                await cur.close()
                raise HTTPException(status.HTTP_409_CONFLICT, f"Subdomain '{sub}' is already taken.")
            await cur.close()
        updates.append("fixed_subdomain = %s")
        params.append(sub)
    # ---- TCP mode + persistent port (v1.0.0, Pro only) ----
    if body.tunnel_mode is not None or body.tcp_port is not None:
        if (user.get("plan") or "free") != "pro":
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                "TCP tunnels are a Pro feature. Upgrade to enable them.",
            )
        if body.tunnel_mode is not None:
            mode = body.tunnel_mode.lower().strip()
            if mode not in ("http", "tcp"):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "tunnel_mode must be http or tcp")
            updates.append("tunnel_mode = %s"); params.append(mode)
        if body.tcp_port is not None:
            cur = await db.execute(
                "SELECT id FROM tokens WHERE tcp_port = %s AND id != %s",
                (body.tcp_port, token_id),
            )
            if await cur.fetchone():
                await cur.close()
                raise HTTPException(status.HTTP_409_CONFLICT, "That TCP port is already taken.")
            await cur.close()
            updates.append("tcp_port = %s"); params.append(body.tcp_port)
    # ---- security options (v0.8.0): empty string clears a setting ----
    import secrets as _secrets
    sec_changed = []
    if body.basic_auth_user is not None:
        u = body.basic_auth_user.strip() or None
        if u and not body.basic_auth_pass:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "basic_auth_pass required when setting basic_auth_user")
        updates.append("basic_auth_user = %s"); params.append(u)
        sec_changed.append("basic_auth" if u else "basic_auth=off")
    if body.basic_auth_pass is not None:
        updates.append("basic_auth_pass = %s"); params.append(body.basic_auth_pass.strip() or None)
    if body.ip_whitelist is not None:
        wl = ",".join(s.strip() for s in body.ip_whitelist.split(",") if s.strip()) or None
        updates.append("ip_whitelist = %s"); params.append(wl)
        sec_changed.append(f"ip_whitelist({len(wl.split(',')) if wl else 0})")
    if body.bearer_key is not None:
        bk = body.bearer_key.strip() or None
        if bk == "auto":
            bk = _secrets.token_hex(16)
        updates.append("bearer_key = %s"); params.append(bk)
        sec_changed.append("bearer_key" if bk else "bearer_key=off")
    if body.https_only is not None:
        updates.append("https_only = %s"); params.append(body.https_only)
        sec_changed.append(f"https_only={body.https_only}")

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    params.append(token_id)
    try:
        cur = await db.execute(
            f"UPDATE tokens SET {', '.join(updates)}, updated_at = now() WHERE id = %s "
            f"RETURNING id, token, name, custom_domain, created_at, fixed_subdomain",
            tuple(params),
        )
        row = await cur.fetchone()
        await cur.close()
        if sec_changed:
            from app.core.audit import log_audit
            await log_audit(db, user["email"], "token.security", row[1], ", ".join(sec_changed))
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This custom domain or subdomain is already in use.",
            )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

    return TokenOut(
        id=str(row[0]),
        token=row[1],
        name=row[2],
        custom_domain=row[3],
        subdomain=row[5] or _subdomain_from_token(row[1]),
        created_at=row[4].isoformat() if row[4] else None,
        fixed_subdomain=row[5],
    )


# ---- Extra domains (v1.4.0): multiple domains per token ----


class DomainIn(BaseModel):
    domain: str = Field(max_length=255)


@router.post("/{token_id}/domains", status_code=status.HTTP_201_CREATED)
async def add_token_domain(
    token_id: str,
    body: DomainIn,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Attach an extra subdomain/domain to a token (Pro: unlimited subdomains of your root domains)."""
    from app.core.config import settings
    cur = await db.execute(
        "SELECT id, user_email, custom_domain FROM tokens WHERE id = %s", (token_id,)
    )
    t = await cur.fetchone()
    await cur.close()
    if not t or (t[1] != user["email"] and user["role"] != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    if (user.get("plan") or "free") != "pro":
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Multiple subdomains are a Pro feature.")
    domain = body.domain.strip().lower()
    domain = _validate_custom_domain(domain, user)
    # Enforce root-domain ownership for subdomains under custom domains
    await _enforce_root_domain_ownership(db, user, domain)
    # v1.8.0: cross-store check — cannot be an extra if it's someone's primary
    cur = await db.execute("SELECT user_email FROM tokens WHERE custom_domain = %s", (domain,))
    prim = await cur.fetchone()
    await cur.close()
    if prim:
        raise HTTPException(status.HTTP_409_CONFLICT, f"That domain is already the primary custom domain of {prim[0]}'s token.")
    try:
        cur = await db.execute(
            "INSERT INTO token_domains (token_id, domain) VALUES (%s, %s) RETURNING domain",
            (token_id, domain),
        )
        d = (await cur.fetchone())[0]
        await cur.close()
    except Exception:
        raise HTTPException(status.HTTP_409_CONFLICT, "That domain is already in use.")
    await log_audit(db, user["email"], "token.domain_add", domain, f"token {token_id[:8]}")
    return {"domain": d}


@router.delete("/{token_id}/domains/{domain}", status_code=status.HTTP_200_OK)
async def remove_token_domain(
    token_id: str,
    domain: str,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute("SELECT user_email FROM tokens WHERE id = %s", (token_id,))
    t = await cur.fetchone()
    await cur.close()
    if not t or (t[0] != user["email"] and user["role"] != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    cur = await db.execute(
        "DELETE FROM token_domains WHERE token_id = %s AND domain = %s RETURNING id",
        (token_id, domain.lower()),
    )
    if not await cur.fetchone():
        await cur.close()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domain not attached to this token")
    await cur.close()
    await log_audit(db, user["email"], "token.domain_remove", domain, f"token {token_id[:8]}")
    try:
        import asyncio
        asyncio.create_task(deprovision_ssl_for_domain(domain.lower()))
    except Exception:
        pass
    return {"removed": domain}


class BulkDeleteIn(BaseModel):
    ids: list[str] = Field(..., max_length=100)


@router.delete("/{token_id}", status_code=status.HTTP_200_OK)
async def delete_token(
    token_id: str,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete a token."""
    # v1.7.0: team-aware delete right
    right = await _token_manage_role(db, token_id, user)
    if right is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    if right == "member":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Read-only: this token is shared with your team — ask a team admin or the owner to delete it")

    # Fetch any domains attached to clean up SSL
    cur = await db.execute("SELECT custom_domain FROM tokens WHERE id = %s", (token_id,))
    cd_row = await cur.fetchone()
    await cur.close()

    cur = await db.execute("SELECT domain FROM token_domains WHERE token_id = %s", (token_id,))
    td_rows = await cur.fetchall()
    await cur.close()

    cur = await db.execute(
        "DELETE FROM tokens WHERE id = %s AND (user_email = %s OR team_id IS NOT NULL) RETURNING token",
        (token_id, user["email"]),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")

    import asyncio
    domains_to_clean = []
    if cd_row and cd_row[0]:
        domains_to_clean.append(str(cd_row[0]))
    for r in td_rows:
        if r[0]:
            domains_to_clean.append(str(r[0]))
    for d in domains_to_clean:
        try:
            asyncio.create_task(deprovision_ssl_for_domain(d))
        except Exception:
            pass

    return {"message": "Token deleted"}


@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
async def bulk_delete_tokens(
    body: BulkDeleteIn,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete up to 100 tokens in one request. Skips tokens the user cannot manage."""
    if not body.ids:
        return {"deleted": 0, "skipped": 0}
    ids = list(dict.fromkeys(body.ids))[:100]  # dedupe + cap
    deleted = 0
    skipped = 0
    for token_id in ids:
        right = await _token_manage_role(db, token_id, user)
        if right is None or right == "member":
            skipped += 1
            continue
        cur = await db.execute(
            "DELETE FROM tokens WHERE id = %s AND (user_email = %s OR team_id IS NOT NULL) RETURNING token",
            (token_id, user["email"]),
        )
        row = await cur.fetchone()
        await cur.close()
        if row:
            deleted += 1
        else:
            skipped += 1
    return {"deleted": deleted, "skipped": skipped}


@router.post("/{token_id}/regenerate", response_model=TokenOut)
async def regenerate_token(
    token_id: str,
    user: dict = Depends(get_api_user),
    db: AsyncConnection = Depends(get_db),
):
    """Regenerate the token string (old token stops working)."""
    new_token = _generate_token()
    try:
        cur = await db.execute(
            "UPDATE tokens SET token = %s, updated_at = now() WHERE id = %s AND user_email = %s "
            "RETURNING id, token, name, custom_domain, created_at",
            (new_token, token_id, user["email"]),
        )
        row = await cur.fetchone()
        await cur.close()
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")

    return TokenOut(
        id=str(row[0]),
        token=row[1],
        name=row[2],
        custom_domain=row[3],
        subdomain=_subdomain_from_token(row[1]),
        created_at=row[4].isoformat() if row[4] else None,
    )


# ================================================================
# Admin endpoints — admin-only, operate across ALL users
# ================================================================

class AdminTokenOut(BaseModel):
    id: str
    token: str
    name: str | None = None
    custom_domain: str | None = None
    subdomain: str | None = None
    user_email: str
    created_at: str | None = None
    total_requests: int = 0
    total_bytes: int = 0
    active_tunnels: int = 0


@router.get("/admin/all", response_model=list[AdminTokenOut])
async def admin_list_all_tokens(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = 200,
):
    """List all tokens across all users (admin only)."""
    cur = await db.execute(
        "SELECT id, token, name, custom_domain, user_email, created_at "
        "FROM tokens ORDER BY created_at DESC LIMIT %s",
        (limit,),
    )
    rows = await cur.fetchall()
    await cur.close()
    out = []
    for r in rows:
        req, byt, act = await _token_traffic(db, r[1])
        out.append(AdminTokenOut(
            id=str(r[0]),
            token=r[1],
            name=r[2],
            custom_domain=r[3],
            subdomain=_subdomain_from_token(r[1]),
            user_email=r[4],
            created_at=r[5].isoformat() if r[5] else None,
            total_requests=req,
            total_bytes=byt,
            active_tunnels=act,
        ))
    return out


@router.delete("/admin/{token_id}", status_code=status.HTTP_200_OK)
async def admin_delete_token(
    token_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete any token by ID (admin only)."""
    cur = await db.execute(
        "DELETE FROM tokens WHERE id = %s RETURNING token", (token_id,)
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    return {"message": "Token deleted"}


@router.post("/admin/{token_id}/regenerate", response_model=AdminTokenOut)
async def admin_regenerate_token(
    token_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Regenerate any token's string (admin only)."""
    new_token = _generate_token()
    cur = await db.execute(
        "UPDATE tokens SET token = %s, updated_at = now() WHERE id = %s "
        "RETURNING id, token, name, custom_domain, user_email, created_at",
        (new_token, token_id),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    return AdminTokenOut(
        id=str(row[0]),
        token=row[1],
        name=row[2],
        custom_domain=row[3],
        subdomain=_subdomain_from_token(row[1]),
        user_email=row[4],
        created_at=row[5].isoformat() if row[5] else None,
    )