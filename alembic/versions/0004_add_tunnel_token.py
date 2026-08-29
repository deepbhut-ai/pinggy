"""add tunnel_token column to users

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-17
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS tunnel_token VARCHAR(64) UNIQUE;
        """
    )
    # Backfill existing users with random tokens
    op.execute(
        """
        UPDATE users
        SET tunnel_token = substring(md5(random()::text || id::text), 1, 16)
        WHERE tunnel_token IS NULL;
        """
    )
    op.execute(
        """
        ALTER TABLE users
        ALTER COLUMN tunnel_token SET NOT NULL;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_users_tunnel_token ON users(tunnel_token);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_users_tunnel_token;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS tunnel_token;")