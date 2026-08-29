"""add plan columns for free/pro tiers

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-21
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users.plan: 'free' (default) or 'pro'
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free';
        """
    )
    # tunnels.tunnel_expires_at: when the free-tier tunnel times out
    op.execute(
        """
        ALTER TABLE tunnels
        ADD COLUMN IF NOT EXISTS tunnel_expires_at TIMESTAMPTZ;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS plan;")
    op.execute("ALTER TABLE tunnels DROP COLUMN IF EXISTS tunnel_expires_at;")