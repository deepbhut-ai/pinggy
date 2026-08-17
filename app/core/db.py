"""Async PostgreSQL connection pool using psycopg3."""
from contextlib import asynccontextmanager
from typing import AsyncIterator

from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool

from app.core.config import settings

_pool: AsyncConnectionPool | None = None


async def init_pool() -> None:
    """Create the global connection pool. Call on app startup."""
    global _pool
    if _pool is not None:
        return
    _pool = AsyncConnectionPool(
        conninfo=settings.async_dsn,
        min_size=2,
        max_size=10,
        open=False,
        timeout=30,
    )
    await _pool.open()
    # Verify connectivity
    async with _pool.connection() as conn:
        cur = await conn.execute("SELECT 1")
        await cur.fetchone()
        await cur.close()


async def close_pool() -> None:
    """Close the pool. Call on app shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized. Did startup run?")
    return _pool


@asynccontextmanager
async def get_conn() -> AsyncIterator[AsyncConnection]:
    """Context manager yielding a pooled connection (auto-commits/returns)."""
    pool = get_pool()
    async with pool.connection() as conn:
        yield conn


async def get_db() -> AsyncIterator[AsyncConnection]:
    """FastAPI dependency that yields a pooled connection."""
    async with get_conn() as conn:
        yield conn