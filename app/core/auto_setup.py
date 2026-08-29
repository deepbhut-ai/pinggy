"""Auto-setup: create database + run migrations on startup.

On any new server, just start the app — this module will:
  1. Connect to PostgreSQL (maintenance DB 'postgres')
  2. Create the target database if it doesn't exist
  3. Enable pgcrypto extension (for gen_random_uuid)
  4. Run all Alembic migrations to head

This eliminates manual `CREATE DATABASE` + `alembic upgrade head` steps.
"""
import logging
import sys
from pathlib import Path

from psycopg import connect
from sqlalchemy import create_engine, text

from app.core.config import settings

logger = logging.getLogger("auto_setup")

# Project root (app/ -> parent)
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _parse_db_parts() -> dict:
    """Extract host, port, user, password, dbname from settings."""
    return {
        "host": settings.POSTGRES_HOST,
        "port": settings.POSTGRES_PORT,
        "user": settings.POSTGRES_USER,
        "password": settings.POSTGRES_PASSWORD,
        "dbname": settings.POSTGRES_DB,
    }


def _ensure_database() -> None:
    """Create the target database if it doesn't exist (sync, via psycopg)."""
    parts = _parse_db_parts()
    admin_dsn = (
        f"host={parts['host']} port={parts['port']} "
        f"user={parts['user']} password={parts['password']} "
        f"dbname=postgres"  # connect to maintenance DB
    )

    try:
        with connect(admin_dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM pg_database WHERE datname = %s",
                    (parts["dbname"],),
                )
                exists = cur.fetchone()
                if exists:
                    logger.info(
                        "Database '%s' already exists — skipping creation.",
                        parts["dbname"],
                    )
                else:
                    # CREATE DATABASE doesn't support parameters; use identifier quoting
                    cur.execute(
                        f'CREATE DATABASE "{parts["dbname"]}"'
                    )
                    logger.info(
                        "Database '%s' created successfully.",
                        parts["dbname"],
                    )
    except Exception as e:
        logger.error("Failed to ensure database exists: %s", e)
        raise


def _ensure_extensions() -> None:
    """Enable pgcrypto extension in the target database (for gen_random_uuid)."""
    parts = _parse_db_parts()
    db_dsn = (
        f"host={parts['host']} port={parts['port']} "
        f"user={parts['user']} password={parts['password']} "
        f"dbname={parts['dbname']}"
    )
    try:
        with connect(db_dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
                logger.info("Extension 'pgcrypto' ensured.")
    except Exception as e:
        logger.error("Failed to enable pgcrypto: %s", e)
        raise


def _run_migrations() -> None:
    """Run Alembic migrations to head using SQLAlchemy engine (sync)."""
    from alembic.config import Config
    from alembic import command

    alembic_ini = PROJECT_ROOT / "alembic.ini"
    if not alembic_ini.exists():
        logger.warning("alembic.ini not found at %s — skipping migrations.", alembic_ini)
        return

    # Build Alembic config programmatically
    cfg = Config(str(alembic_ini))
    cfg.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    # env.py reads settings.DATABASE_URL directly, so no need to set sqlalchemy.url

    try:
        command.upgrade(cfg, "head")
        logger.info("Migrations applied to head.")
    except Exception as e:
        logger.error("Migration failed: %s", e)
        raise


def _ensure_default_admin() -> None:
    """Create the default admin user (admin/admin) if no users exist yet.

    Uses bcrypt for password hashing (same as the app's security module).
    """
    import bcrypt

    parts = _parse_db_parts()
    db_dsn = (
        f"host={parts['host']} port={parts['port']} "
        f"user={parts['user']} password={parts['password']} "
        f"dbname={parts['dbname']}"
    )
    try:
        with connect(db_dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                # Check if any users exist
                cur.execute("SELECT COUNT(*) FROM users")
                count = cur.fetchone()[0]
                if count > 0:
                    logger.info("Users already exist (%d) — skipping default admin.", count)
                    return

                # Create default admin: username 'admin', password 'admin'
                import secrets as _secrets
                tunnel_token = _secrets.token_hex(8)
                hashed = bcrypt.hashpw(b"admin", bcrypt.gensalt()).decode()
                cur.execute(
                    """
                    INSERT INTO users (email, password_hash, full_name, role, tunnel_token)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    ("admin", hashed, "Default Admin", "admin", tunnel_token),
                )
                logger.info("Default admin user created (email='admin', password='admin').")
    except Exception as e:
        logger.error("Failed to create default admin: %s", e)
        raise


def run_auto_setup() -> None:
    """Run the full auto-setup sequence: DB creation + extensions + migrations.

    Call this BEFORE initializing the async connection pool.
    Uses synchronous psycopg + SQLAlchemy (Alembic is sync internally).
    """
    print(f"[auto_setup] Starting auto-setup for '{settings.POSTGRES_DB}'...")
    _ensure_database()
    _ensure_extensions()
    _run_migrations()
    _ensure_default_admin()
    print("[auto_setup] Auto-setup complete. Database ready.")