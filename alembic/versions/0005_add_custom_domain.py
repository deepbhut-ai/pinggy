"""add custom_domain column to users

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-20
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) UNIQUE;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS custom_domain;")