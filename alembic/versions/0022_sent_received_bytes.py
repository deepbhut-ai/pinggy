"""per-direction traffic: bytes_sent (responses out) + bytes_received (requests in)

Revision ID: 0022
Revises: 0021
Create Date: 2026-08-30
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE tunnels
        ADD COLUMN IF NOT EXISTS bytes_sent     BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS bytes_received BIGINT NOT NULL DEFAULT 0;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE tunnels
        DROP COLUMN IF EXISTS bytes_sent,
        DROP COLUMN IF EXISTS bytes_received;
        """
    )
