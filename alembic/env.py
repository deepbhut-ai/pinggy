"""Alembic env.py — uses SQLAlchemy engine with psycopg3 driver.

Migrations use op.execute() with raw SQL. The DB URL comes from app settings.
No SQLAlchemy ORM models are needed — Alembic just needs the engine for
transaction management and version table bookkeeping.
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

# Ensure app is importable
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _dsn() -> str:
    """Return SQLAlchemy-style DSN (postgresql+psycopg://...)."""
    return settings.DATABASE_URL


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL to stdout)."""
    context.configure(
        url=_dsn(),
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations using a SQLAlchemy engine (psycopg3 driver)."""
    connectable = create_engine(_dsn(), poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()