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


@router.put("/multiport")
async def save_multiport_config(
    body: MultiPortConfig,
    request: Request,
    db: AsyncConnection = Depends(get_db),
):
    """Save multi-port toggle + per-address port settings for a token."""
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

    cur = await db.execute(
        """INSERT INTO tunnel_configs (user_email, name, config)
           VALUES (%s, %s, %s)
           ON CONFLICT (user_email, name) DO UPDATE
           SET config = EXCLUDED.config
           RETURNING id""",
        (user_email, f"multiport:{body.token}", _json.dumps({
            "multi_port_enabled": body.multi_port_enabled,
            "ports": body.ports,
        })),
    )
    row = await cur.fetchone()
    await cur.close()

    # Live sync active tunnel session paused/resumed states & notify user terminal
    try:
        await sync_tunnel_multiport_config(user_email, body.token, body.ports)
    except Exception:
        pass

    return {"saved": True, "id": str(row[0]) if row else ""}


@router.get("/multiport/{token}")
async def get_multiport_config(
    token: str,
    request: Request,
    db: AsyncConnection = Depends(get_db),
):
    """Load saved multi-port config for a token. Returns empty if not saved yet."""
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

    cur = await db.execute(
        "SELECT config FROM tunnel_configs WHERE user_email = %s AND name = %s",
        (user_email, f"multiport:{token}"),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        return {"multi_port_enabled": True, "ports": {}}
    cfg = _json.loads(row[0]) if isinstance(row[0], str) else row[0]
    return cfg


@router.get("/cli/{token}")
async def get_cli_tunnel_config(
    token: str,
    db: AsyncConnection = Depends(get_db),
):
    """Fetch saved multiport and domain mappings for a token to power zero-flag CLI connections."""
    import json as _json
    from app.core.config import settings

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

    # Fallback to users table (legacy single-token)
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
