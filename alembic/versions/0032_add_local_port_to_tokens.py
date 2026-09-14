"""Add local_port column to tokens table.

Persists the local service port (e.g. 8080, 3000) per token in the database
instead of relying on browser localStorage. This makes the port available
across all devices and visible in the Manage Tokens table.

Revision ID: 0032
Revises: 0031
Create Date: 2026-09-14
"""
from alembic import op

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE tokens
        ADD COLUMN IF NOT EXISTS local_port INTEGER
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE tokens
        DROP COLUMN IF EXISTS local_port
        """
    )