"""add seats column to payments

Revision ID: 0027
Revises: 0026
Create Date: 2026-09-08
"""
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE payments ADD COLUMN IF NOT EXISTS seats integer NOT NULL DEFAULT 1")


def downgrade() -> None:
    op.execute("ALTER TABLE payments DROP COLUMN IF EXISTS seats")