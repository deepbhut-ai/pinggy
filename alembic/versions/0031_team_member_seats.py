"""Add seat allocation columns to team_members.

Revision ID: 0031
Revises: 0030
Create Date: 2026-09-11
"""
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE team_members 
        ADD COLUMN IF NOT EXISTS has_seat BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS seat_assigned_at TIMESTAMPTZ;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE team_members 
        DROP COLUMN IF EXISTS seat_assigned_at,
        DROP COLUMN IF EXISTS has_seat;
        """
    )
