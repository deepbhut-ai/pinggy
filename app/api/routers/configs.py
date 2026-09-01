"""Saved command-builder configurations (v0.7.0 Command Builder 2.0)."""
from fastapi import APIRouter, Depends, HTTPException, status
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
