"""Teams router (v1.4.0) — create teams, add/remove members, team tokens."""
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_current_user

router = APIRouter(prefix="/teams", tags=["teams"])


def _team_out(r) -> dict:
    return {"id": str(r[0]), "name": r[1], "owner_email": r[2],
            "created_at": r[3].isoformat() if r[3] else None}


@router.get("")
async def my_teams(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Teams I own + teams I'm a member of (with member counts)."""
    cur = await db.execute(
        """
        SELECT DISTINCT t.id, t.name, t.owner_email, t.created_at
        FROM teams t
        LEFT JOIN team_members m ON m.team_id = t.id
        WHERE t.owner_email = %s OR m.user_email = %s
        """,
        (user["email"], user["email"]),
    )
    rows = await cur.fetchall()
    await cur.close()
    out = []
    for r in rows:
        team = _team_out(r)
        cur = await db.execute(
            "SELECT user_email, role FROM team_members WHERE team_id = %s ORDER BY added_at",
            (r[0],),
        )
        members = [{"email": m[0], "role": m[1]} for m in await cur.fetchall()]
        await cur.close()
        team["members"] = members
        team["i_own"] = r[2] == user["email"]
        out.append(team)
    return out


class TeamIn(BaseModel):
    name: str = Field(max_length=120)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_team(
    body: TeamIn,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "INSERT INTO teams (name, owner_email) VALUES (%s, %s) RETURNING id, name, owner_email, created_at",
        (body.name, user["email"]),
    )
    r = await cur.fetchone()
    await cur.close()
    # owner is automatically an admin member
    cur = await db.execute(
        "INSERT INTO team_members (team_id, user_email, role) VALUES (%s, %s, 'admin') ON CONFLICT DO NOTHING",
        (r[0], user["email"]),
    )
    await cur.close()
    await log_audit(db, user["email"], "team.create", body.name, "team created")
    return _team_out(r)


class MemberIn(BaseModel):
    email: str = Field(max_length=255)
    role: str = "member"  # member | admin


@router.post("/{team_id}/members")
async def add_member(
    team_id: str,
    body: MemberIn,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    # only team admins/owner can add
    cur = await db.execute("SELECT owner_email FROM teams WHERE id = %s", (team_id,))
    t = await cur.fetchone()
    await cur.close()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    is_admin = t[0] == user["email"]
    if not is_admin:
        cur = await db.execute(
            "SELECT role FROM team_members WHERE team_id = %s AND user_email = %s",
            (team_id, user["email"]),
        )
        m = await cur.fetchone()
        await cur.close()
        is_admin = m and m[0] == "admin"
    if not is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only team admins can add members")
    if body.role not in ("member", "admin"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "role must be member or admin")
    email = body.email.strip().lower()
    # member must be a registered user
    cur = await db.execute("SELECT 1 FROM users WHERE email = %s", (email,))
    if not await cur.fetchone():
        await cur.close()
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No IRAGT account with email {email} — ask them to sign up first.")
    await cur.close()
    try:
        cur = await db.execute(
            "INSERT INTO team_members (team_id, user_email, role) VALUES (%s, %s, %s)",
            (team_id, email, body.role),
        )
        await cur.close()
    except Exception:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already a member of this team")
    await log_audit(db, user["email"], "team.add_member", email, f"role={body.role}")
    return {"added": email, "role": body.role}


@router.delete("/{team_id}/members/{email}")
async def remove_member(
    team_id: str,
    email: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    email = email.strip().lower()
    cur = await db.execute("SELECT owner_email FROM teams WHERE id = %s", (team_id,))
    t = await cur.fetchone()
    await cur.close()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    if t[0] != user["email"] and user["email"] != email:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or the member themselves can remove")
    if email == t[0]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Owner cannot be removed — delete the team instead")
    cur = await db.execute(
        "DELETE FROM team_members WHERE team_id = %s AND user_email = %s RETURNING id",
        (team_id, email),
    )
    if not await cur.fetchone():
        await cur.close()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    await cur.close()
    await log_audit(db, user["email"], "team.remove_member", email, "")
    return {"removed": email}


@router.delete("/{team_id}")
async def delete_team(
    team_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "DELETE FROM teams WHERE id = %s AND owner_email = %s RETURNING name",
        (team_id, user["email"]),
    )
    r = await cur.fetchone()
    await cur.close()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found (or you don't own it)")
    # unassign team tokens
    cur = await db.execute("UPDATE tokens SET team_id = NULL WHERE team_id = %s", (team_id,))
    await cur.close()
    await log_audit(db, user["email"], "team.delete", r[0], "team deleted")
    return {"deleted": r[0]}
