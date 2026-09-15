"""Blogs API — public reading and admin CRUD management."""
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection
from pydantic import BaseModel, Field

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user, get_optional_current_user

router = APIRouter(prefix="/blogs", tags=["blogs"])


class BlogOut(BaseModel):
    id: str
    slug: str
    title: str
    summary: str | None = None
    content: str
    category: str
    author: str
    read_time: str
    featured: bool
    published: bool
    published_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class BlogListOut(BaseModel):
    id: str
    slug: str
    title: str
    summary: str | None = None
    category: str
    author: str
    read_time: str
    featured: bool
    published: bool
    published_at: str | None = None
    created_at: str | None = None


class BlogCreate(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    slug: str | None = Field(default=None, max_length=200)
    summary: str | None = None
    content: str = Field(min_length=10)
    category: str = Field(default="Engineering", max_length=100)
    author: str = Field(default="IRAGT Team", max_length=100)
    read_time: str = Field(default="5 min read", max_length=50)
    featured: bool = False
    published: bool = True


class BlogUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=300)
    slug: str | None = Field(default=None, max_length=200)
    summary: str | None = None
    content: str | None = Field(default=None, min_length=10)
    category: str | None = Field(default=None, max_length=100)
    author: str | None = Field(default=None, max_length=100)
    read_time: str | None = Field(default=None, max_length=50)
    featured: bool | None = None
    published: bool | None = None


_COLS = "id, slug, title, summary, content, category, author, read_time, featured, published, published_at, created_at, updated_at"
_LIST_COLS = "id, slug, title, summary, category, author, read_time, featured, published, published_at, created_at"


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


@router.get("", response_model=list[BlogListOut])
async def list_blogs(
    db: AsyncConnection = Depends(get_db),
    user: dict | None = Depends(get_optional_current_user),
    category: str | None = None,
    all: bool = Query(False, description="Admin only: show drafts"),
):
    """List blog posts. Public users receive only published posts."""
    is_admin = user and user.get("role") == "admin"
    where_clauses = []
    params = []

    if not (is_admin and all):
        where_clauses.append("published = TRUE")

    if category and category.lower() != "all":
        where_clauses.append("LOWER(category) = LOWER(%s)")
        params.append(category)

    where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    q = f"SELECT {_LIST_COLS} FROM blogs {where_str} ORDER BY featured DESC, published_at DESC NULLS LAST, created_at DESC LIMIT 100"

    cur = await db.execute(q, tuple(params))
    rows = await cur.fetchall()
    await cur.close()

    return [
        BlogListOut(
            id=str(r[0]),
            slug=r[1],
            title=r[2],
            summary=r[3],
            category=r[4],
            author=r[5],
            read_time=r[6],
            featured=r[7],
            published=r[8],
            published_at=r[9].isoformat() if r[9] else None,
            created_at=r[10].isoformat() if r[10] else None,
        )
        for r in rows
    ]


@router.get("/{slug_or_id}", response_model=BlogOut)
async def get_blog(
    slug_or_id: str,
    db: AsyncConnection = Depends(get_db),
    user: dict | None = Depends(get_optional_current_user),
):
    """Get single blog post by slug or ID."""
    is_admin = user and user.get("role") == "admin"
    cur = await db.execute(
        f"SELECT {_COLS} FROM blogs WHERE slug = %s OR id::text = %s LIMIT 1",
        (slug_or_id, slug_or_id),
    )
    r = await cur.fetchone()
    await cur.close()

    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Blog post not found")

    published = r[9]
    if not published and not is_admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Blog post not found")

    return BlogOut(
        id=str(r[0]),
        slug=r[1],
        title=r[2],
        summary=r[3],
        content=r[4],
        category=r[5],
        author=r[6],
        read_time=r[7],
        featured=r[8],
        published=r[9],
        published_at=r[10].isoformat() if r[10] else None,
        created_at=r[11].isoformat() if r[11] else None,
        updated_at=r[12].isoformat() if r[12] else None,
    )


@router.post("", response_model=BlogOut, status_code=status.HTTP_201_CREATED)
async def create_blog(
    body: BlogCreate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Admin: create a new blog post."""
    slug = _slugify(body.slug if body.slug and body.slug.strip() else body.title)
    if not slug:
        slug = f"post-{int(datetime.now().timestamp())}"

    # Ensure unique slug
    cur = await db.execute("SELECT id FROM blogs WHERE slug = %s", (slug,))
    exists = await cur.fetchone()
    await cur.close()
    if exists:
        slug = f"{slug}-{int(datetime.now().timestamp())}"

    cur = await db.execute(
        f"""INSERT INTO blogs (slug, title, summary, content, category, author, read_time, featured, published, published_at, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())
        RETURNING {_COLS}""",
        (
            slug,
            body.title,
            body.summary,
            body.content,
            body.category,
            body.author,
            body.read_time,
            body.featured,
            body.published,
        ),
    )
    r = await cur.fetchone()
    await cur.close()

    await log_audit(db, admin["email"], "blog.create", body.title, f"slug={slug} category={body.category}")

    return BlogOut(
        id=str(r[0]),
        slug=r[1],
        title=r[2],
        summary=r[3],
        content=r[4],
        category=r[5],
        author=r[6],
        read_time=r[7],
        featured=r[8],
        published=r[9],
        published_at=r[10].isoformat() if r[10] else None,
        created_at=r[11].isoformat() if r[11] else None,
        updated_at=r[12].isoformat() if r[12] else None,
    )


@router.put("/{blog_id}", response_model=BlogOut)
async def update_blog(
    blog_id: str,
    body: BlogUpdate,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Admin: update an existing blog post."""
    updates = []
    params = []

    if body.title is not None:
        updates.append("title = %s")
        params.append(body.title)
    if body.slug is not None and body.slug.strip():
        clean_slug = _slugify(body.slug)
        updates.append("slug = %s")
        params.append(clean_slug)
    if body.summary is not None:
        updates.append("summary = %s")
        params.append(body.summary)
    if body.content is not None:
        updates.append("content = %s")
        params.append(body.content)
    if body.category is not None:
        updates.append("category = %s")
        params.append(body.category)
    if body.author is not None:
        updates.append("author = %s")
        params.append(body.author)
    if body.read_time is not None:
        updates.append("read_time = %s")
        params.append(body.read_time)
    if body.featured is not None:
        updates.append("featured = %s")
        params.append(body.featured)
    if body.published is not None:
        updates.append("published = %s")
        params.append(body.published)
        if body.published:
            updates.append("published_at = COALESCE(published_at, NOW())")

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    updates.append("updated_at = NOW()")
    params.append(blog_id)

    cur = await db.execute(
        f"UPDATE blogs SET {', '.join(updates)} WHERE id::text = %s RETURNING {_COLS}",
        tuple(params),
    )
    r = await cur.fetchone()
    await cur.close()

    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Blog post not found")

    await log_audit(db, admin["email"], "blog.update", r[2], f"id={blog_id}")

    return BlogOut(
        id=str(r[0]),
        slug=r[1],
        title=r[2],
        summary=r[3],
        content=r[4],
        category=r[5],
        author=r[6],
        read_time=r[7],
        featured=r[8],
        published=r[9],
        published_at=r[10].isoformat() if r[10] else None,
        created_at=r[11].isoformat() if r[11] else None,
        updated_at=r[12].isoformat() if r[12] else None,
    )


@router.delete("/{blog_id}", status_code=status.HTTP_200_OK)
async def delete_blog(
    blog_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Admin: delete a blog post."""
    cur = await db.execute("DELETE FROM blogs WHERE id::text = %s RETURNING title", (blog_id,))
    r = await cur.fetchone()
    await cur.close()

    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Blog post not found")

    await log_audit(db, admin["email"], "blog.delete", r[0], f"id={blog_id}")
    return {"message": f"Blog post '{r[0]}' deleted successfully"}
