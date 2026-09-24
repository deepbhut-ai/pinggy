"""Saved command-builder configurations (v0.7.0 Command Builder 2.0)."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.db import get_db
from app.core.deps import get_current_user

router = APIRouter(prefix="/configs", tags=["configs"])


class ConfigOut(BaseModel):
    id: str
    name: str
    config: dict
    created_at: str | None = None


class ConfigIn(BaseModel):
    name: str = Field(max_length=120)
    config: dict


# ================================================================
# Multi-port tunnel configuration — persist toggle + port per address
# MUST be before /{config_id} routes to avoid path-param conflict
# ================================================================

class MultiPortConfig(BaseModel):
    token: str
    multi_port_enabled: bool = True
    ports: dict = Field(default_factory=dict)  # {"address.com": {"enabled": true, "port": "3000"}}
    tz: str | None = None


async def _get_active_user_domains_and_ports(db: AsyncConnection, user_email: str) -> tuple[set[str], dict[str, str], set[str]]:
    """Return (set_of_active_domain_names, token_ports_map, active_token_strings)."""
    import hashlib
    from app.core.config import settings
    active_domains = set()
    token_ports = {}
    active_tokens = set()

    # Query tokens table
    cur = await db.execute(
        "SELECT token, custom_domain, fixed_subdomain, local_port FROM tokens WHERE user_email = %s",
        (user_email,),
    )
    rows = await cur.fetchall()
    await cur.close()

    for tk, cd, fs, lp in rows:
        if tk:
            active_tokens.add(tk)
        if cd and cd.strip():
            norm_cd = cd.strip().lower()
            active_domains.add(norm_cd)
            if lp:
                token_ports[norm_cd] = str(lp)
        elif fs and fs.strip():
            norm_fs = f"{fs.strip().lower()}.{settings.TUNNEL_DOMAIN}"
            active_domains.add(norm_fs)
            if lp:
                token_ports[norm_fs] = str(lp)

    # Query token_domains table
    cur = await db.execute(
        "SELECT td.domain FROM token_domains td JOIN tokens t ON t.id = td.token_id WHERE t.user_email = %s",
        (user_email,),
    )
    td_rows = await cur.fetchall()
    await cur.close()
    for td in td_rows:
        if td[0] and td[0].strip():
            active_domains.add(td[0].strip().lower())

    # Legacy users table fallback
    cur = await db.execute(
        "SELECT tunnel_token, custom_domain FROM users WHERE email = %s",
        (user_email,),
    )
    u_row = await cur.fetchone()
    await cur.close()
    if u_row:
        if u_row[0]:
            active_tokens.add(u_row[0])
        if u_row[1] and u_row[1].strip():
            active_domains.add(u_row[1].strip().lower())

    return active_domains, token_ports, active_tokens


@router.put("/multiport")
async def save_multiport_config(
    body: MultiPortConfig,
    request: Request,
    db: AsyncConnection = Depends(get_db),
):
    """Save multi-port toggle + per-address port settings for an account, preventing duplicate ports and pruning deleted domains."""
    import json as _json
    from app.core.tunnel_registry import sync_tunnel_multiport_config
    from app.core.deps import get_optional_current_user

    user = await get_optional_current_user(request, db)
    user_email = user["email"] if user else None

    if not user_email:
        # Resolve user_email from token
        cur = await db.execute(
            "SELECT user_email FROM tokens WHERE token = %s",
            (body.token,),
        )
        t_row = await cur.fetchone()
        await cur.close()
        if t_row and t_row[0]:
            user_email = t_row[0]
        else:
            cur = await db.execute(
                "SELECT email FROM users WHERE tunnel_token = %s",
                (body.token,),
            )
            u_row = await cur.fetchone()
            await cur.close()
            if u_row and u_row[0]:
                user_email = u_row[0]

    if not user_email:
        raise HTTPException(status_code=401, detail="Authentication required")

    active_domains, token_ports, active_tokens = await _get_active_user_domains_and_ports(db, user_email)

    # 1. Fetch all existing multiport ports for this user from tunnel_configs
    cur = await db.execute(
        "SELECT name, config FROM tunnel_configs WHERE user_email = %s AND name LIKE 'multiport:%%'",
        (user_email,),
    )
    rows = await cur.fetchall()
    await cur.close()

    merged_ports = {}
    for _, config_data in rows:
        cfg = _json.loads(config_data) if isinstance(config_data, str) else config_data
        if isinstance(cfg, dict) and isinstance(cfg.get("ports"), dict):
            for dom, p_info in cfg["ports"].items():
                if dom and dom.strip().lower() in active_domains:
                    merged_ports[dom] = p_info

    # Also merge ports from tokens table for active domains
    for dom_k, lp_val in token_ports.items():
        if dom_k not in merged_ports:
            merged_ports[dom_k] = {"enabled": True, "port": lp_val}

    # 2. Validate port uniqueness: check if any incoming enabled port conflicts with another domain
    for d, info in body.ports.items():
        if isinstance(info, dict):
            p = str(info.get("port") or "").strip().lstrip(":")
            is_en = info.get("enabled", True) is not False
            if p and is_en:
                # Check against other domains in body.ports
                for d2, info2 in body.ports.items():
                    if d2.lower() != d.lower():
                        p2 = str(info2.get("port") or "").strip().lstrip(":") if isinstance(info2, dict) else str(info2 or "").strip().lstrip(":")
                        is_en2 = info2.get("enabled", True) is not False if isinstance(info2, dict) else True
                        if p == p2 and is_en2:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Port :{p} is already in use by {d2}",
                            )
                # Check against other existing active domains for this user
                for ex_d, ex_info in merged_ports.items():
                    if ex_d.lower() != d.lower() and ex_d.lower() not in [k.lower() for k in body.ports.keys()]:
                        ex_p = str(ex_info.get("port") or "").strip().lstrip(":") if isinstance(ex_info, dict) else str(ex_info or "").strip().lstrip(":")
                        ex_en = ex_info.get("enabled", True) is not False if isinstance(ex_info, dict) else True
                        if p == ex_p and ex_en:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Port :{p} is already in use by {ex_d}",
                            )

    # 3. Merge incoming ports into the full user map (filtered against active domains)
    for d, info in body.ports.items():
        if d and (d.strip().lower() in active_domains or not active_domains):
            merged_ports[d] = info

    # 4. Save to current token config
    config_json = _json.dumps({
        "multi_port_enabled": body.multi_port_enabled,
        "ports": merged_ports,
    })

    cur = await db.execute(
        """INSERT INTO tunnel_configs (user_email, name, config)
           VALUES (%s, %s, %s)
           ON CONFLICT (user_email, name) DO UPDATE
           SET config = EXCLUDED.config
           RETURNING id""",
        (user_email, f"multiport:{body.token}", config_json),
    )
    row = await cur.fetchone()
    await cur.close()

    # 5. Sync across all active multiport records for this user and delete dead tokens' configs
    for name, _ in rows:
        tk_part = name.replace("multiport:", "")
        if active_tokens and tk_part not in active_tokens:
            await db.execute(
                "DELETE FROM tunnel_configs WHERE user_email = %s AND name = %s",
                (user_email, name),
            )
        elif name != f"multiport:{body.token}":
            await db.execute(
                "UPDATE tunnel_configs SET config = %s WHERE user_email = %s AND name = %s",
                (config_json, user_email, name),
            )

    # 6. Update local_port in tokens table for matching domains
    for domain_name, p_info in body.ports.items():
        if isinstance(p_info, dict) and p_info.get("port"):
            try:
                p_int = int(str(p_info["port"]).strip().lstrip(":"))
                await db.execute(
                    "UPDATE tokens SET local_port = %s WHERE user_email = %s AND (custom_domain = %s OR fixed_subdomain = %s)",
                    (p_int, user_email, domain_name, domain_name.split(".")[0]),
                )
            except ValueError:
                pass

    # 7. Live sync active tunnel session paused/resumed states & notify user terminal
    try:
        if body.tz and body.tz.strip():
            from app.core.redis import get_redis
            r = get_redis()
            if r:
                clean_tz = body.tz.strip()[:64]
                if body.token:
                    await r.set(f"usertz:{body.token}", clean_tz, ex=7 * 86400)
                if user_email:
                    await r.set(f"usertz:{user_email}", clean_tz, ex=7 * 86400)
        await sync_tunnel_multiport_config(user_email, body.token, merged_ports, tz=body.tz)
    except Exception:
        pass

    # Ensure all multiport domains have active Let's Encrypt SSL and Nginx configs
    if merged_ports:
        import asyncio
        from app.core.ssl_manager import provision_ssl_for_domain, get_ssl_status
        async def _ensure_multiport_ssl():
            for addr in merged_ports.keys():
                norm = addr.replace("https://", "").replace("http://", "").strip().lower().split("/")[0].split(":")[0]
                if norm and not norm.endswith(".iraglobaltech.com") and norm != "iraglobaltech.com":
                    try:
                        stat = await get_ssl_status(norm)
                        if not stat.get("has_ssl_certificate") or not stat.get("has_nginx_active"):
                            await provision_ssl_for_domain(norm, email=user_email, skip_dns_check=True)
                    except Exception:
                        pass
        asyncio.create_task(_ensure_multiport_ssl())

    return {"saved": True, "id": str(row[0]) if row else "", "ports": merged_ports}


@router.get("/multiport/{token}")
async def get_multiport_config(
    token: str,
    request: Request,
    db: AsyncConnection = Depends(get_db),
):
    """Load saved multi-port config for an account/token. Automatically prunes deleted domains and dead tokens."""
    import json as _json
    from app.core.deps import get_optional_current_user

    user = await get_optional_current_user(request, db)
    user_email = user["email"] if user else None

    if not user_email:
        cur = await db.execute(
            "SELECT user_email FROM tokens WHERE token = %s",
            (token,),
        )
        t_row = await cur.fetchone()
        await cur.close()
        if t_row and t_row[0]:
            user_email = t_row[0]
        else:
            cur = await db.execute(
                "SELECT email FROM users WHERE tunnel_token = %s",
                (token,),
            )
            u_row = await cur.fetchone()
            await cur.close()
            if u_row and u_row[0]:
                user_email = u_row[0]

    if not user_email:
        return {"multi_port_enabled": True, "ports": {}}

    active_domains, token_ports, active_tokens = await _get_active_user_domains_and_ports(db, user_email)

    # 1. Fetch all multiport entries for this user from tunnel_configs
    cur = await db.execute(
        "SELECT name, config FROM tunnel_configs WHERE user_email = %s AND name LIKE 'multiport:%%'",
        (user_email,),
    )
    rows = await cur.fetchall()
    await cur.close()

    merged_ports = {}
    multi_port_enabled = True
    had_stale_data = False

    for name, config_data in rows:
        tk_part = name.replace("multiport:", "")
        if active_tokens and tk_part not in active_tokens:
            had_stale_data = True
            await db.execute(
                "DELETE FROM tunnel_configs WHERE user_email = %s AND name = %s",
                (user_email, name),
            )
            continue

        cfg = _json.loads(config_data) if isinstance(config_data, str) else config_data
        if isinstance(cfg, dict):
            if name == f"multiport:{token}":
                multi_port_enabled = cfg.get("multi_port_enabled", True)
            ports = cfg.get("ports", {})
            if isinstance(ports, dict):
                for dom, p_info in ports.items():
                    if dom:
                        if dom.strip().lower() in active_domains or not active_domains:
                            if dom not in merged_ports:
                                merged_ports[dom] = p_info
                        else:
                            had_stale_data = True

    # 2. Also merge domains and local_ports from active tokens table for this user
    for dom_k, lp_val in token_ports.items():
        if dom_k not in merged_ports:
            merged_ports[dom_k] = {"enabled": True, "port": lp_val}
        elif lp_val and not merged_ports[dom_k].get("port"):
            merged_ports[dom_k]["port"] = lp_val

    # If stale data was cleaned up, sync the sanitized config back to DB
    if had_stale_data and active_tokens:
        clean_json = _json.dumps({
            "multi_port_enabled": multi_port_enabled,
            "ports": merged_ports,
        })
        for act_tk in active_tokens:
            await db.execute(
                """INSERT INTO tunnel_configs (user_email, name, config)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (user_email, name) DO UPDATE
                   SET config = EXCLUDED.config""",
                (user_email, f"multiport:{act_tk}", clean_json),
            )

    return {"multi_port_enabled": multi_port_enabled, "ports": merged_ports}


@router.get("/cli/{token}")
async def get_cli_tunnel_config(
    token: str,
    tz: str | None = None,
    db: AsyncConnection = Depends(get_db),
):
    """Fetch saved multiport and domain mappings for a token to power zero-flag CLI connections."""
    import json as _json
    from app.core.config import settings

    if tz and tz.strip():
        try:
            from app.core.redis import get_redis
            r = get_redis()
            if r:
                await r.set(f"usertz:{token}", tz.strip()[:64], ex=7 * 86400)
        except Exception:
            pass

    # 1. Lookup token in tokens table
    user_email = None
    custom_domain = ""
    default_port = 8080
    token_id = None

    try:
        cur = await db.execute(
            "SELECT t.id, t.user_email, t.custom_domain, t.local_port, u.is_active "
            "FROM tokens t JOIN users u ON u.email = t.user_email "
            "WHERE t.token = %s",
            (token,),
        )
        row = await cur.fetchone()
        await cur.close()
        if row:
            if not row[4]:
                raise HTTPException(status_code=403, detail="Account is disabled")
            token_id, user_email, custom_domain, default_port = row[0], row[1], row[2] or "", row[3] or 8080
    except Exception:
        pass

    if not user_email:
        cur = await db.execute(
            "SELECT email, custom_domain, is_active FROM users WHERE tunnel_token = %s",
            (token,),
        )
        row = await cur.fetchone()
        await cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Invalid or inactive token")
        if not row[2]:
            raise HTTPException(status_code=403, detail="Account is disabled")
        user_email, custom_domain = row[0], row[1] or ""

    if tz and tz.strip() and user_email:
        try:
            from app.core.redis import get_redis
            r = get_redis()
            if r:
                await r.set(f"usertz:{user_email}", tz.strip()[:64], ex=7 * 86400)
        except Exception:
            pass

    active_domains, token_ports, _ = await _get_active_user_domains_and_ports(db, user_email)

    # 2. Fetch saved multiport settings from tunnel_configs
    cur = await db.execute(
        "SELECT config FROM tunnel_configs WHERE user_email = %s AND name = %s",
        (user_email, f"multiport:{token}"),
    )
    cfg_row = await cur.fetchone()
    await cur.close()

    ports = []
    if cfg_row:
        cfg = _json.loads(cfg_row[0]) if isinstance(cfg_row[0], str) else cfg_row[0]
        if cfg.get("multi_port_enabled", True) and cfg.get("ports"):
            for addr, info in cfg.get("ports", {}).items():
                if addr and addr.strip().lower() in active_domains:
                    if isinstance(info, dict):
                        raw_port = info.get("port")
                        is_enabled = info.get("enabled", True) is not False
                        if raw_port and str(raw_port).strip():
                            try:
                                ports.append({
                                    "domain": addr,
                                    "local_port": int(str(raw_port).strip()),
                                    "enabled": is_enabled,
                                })
                            except ValueError:
                                pass

    # 3. If no custom multiport entries configured, build default list
    if not ports:
        main_addr = custom_domain if custom_domain else f"{token}.{settings.TUNNEL_DOMAIN}"
        ports.append({"domain": main_addr, "local_port": default_port, "enabled": True})
        # Add any extra domains attached to this token
        if token_id:
            try:
                cur = await db.execute(
                    "SELECT domain FROM token_domains WHERE token_id = %s",
                    (token_id,),
                )
                extra_rows = await cur.fetchall()
                await cur.close()
                for er in extra_rows:
                    if er[0] and er[0] not in [p["domain"] for p in ports]:
                        ports.append({"domain": er[0], "local_port": default_port, "enabled": True})
            except Exception:
                pass

    ssh_host = f"ssh.{settings.TUNNEL_DOMAIN}" if not settings.TUNNEL_DOMAIN.startswith("ssh.") else settings.TUNNEL_DOMAIN

    return {
        "status": "success",
        "token": token,
        "ssh_host": ssh_host,
        "ssh_port": settings.SSH_PORT,
        "ports": ports,
    }


@router.get("", response_model=list[ConfigOut])
async def list_configs(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "SELECT id, name, config, created_at FROM tunnel_configs WHERE user_email = %s ORDER BY created_at DESC",
        (user["email"],),
    )
    import json as _json
    rows = await cur.fetchall()
    await cur.close()
    return [
        ConfigOut(id=str(r[0]), name=r[1], config=_json.loads(r[2]),
                  created_at=r[3].isoformat() if r[3] else None)
        for r in rows
    ]


@router.post("", response_model=ConfigOut, status_code=status.HTTP_201_CREATED)
async def save_config(
    body: ConfigIn,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    import json as _json
    cur = await db.execute(
        """INSERT INTO tunnel_configs (user_email, name, config) VALUES (%s, %s, %s)
           RETURNING id, name, config, created_at""",
        (user["email"], body.name, _json.dumps(body.config)),
    )
    r = await cur.fetchone()
    await cur.close()
    return ConfigOut(id=str(r[0]), name=r[1], config=_json.loads(r[2]),
                     created_at=r[3].isoformat() if r[3] else None)


@router.put("/{config_id}", response_model=ConfigOut)
async def update_config(
    config_id: str,
    body: ConfigIn,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    import json as _json
    cur = await db.execute(
        """UPDATE tunnel_configs SET name = %s, config = %s
           WHERE id = %s AND user_email = %s RETURNING id, name, config, created_at""",
        (body.name, _json.dumps(body.config), config_id, user["email"]),
    )
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Config not found")
    return ConfigOut(id=str(r[0]), name=r[1], config=_json.loads(r[2]),
                     created_at=r[3].isoformat() if r[3] else None)


@router.delete("/{config_id}", status_code=status.HTTP_200_OK)
async def delete_config(
    config_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "DELETE FROM tunnel_configs WHERE id = %s AND user_email = %s RETURNING id",
        (config_id, user["email"]),
    )
    if not await cur.fetchone():
        await cur.close()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Config not found")
    await cur.close()
    return {"message": "Config deleted"}
