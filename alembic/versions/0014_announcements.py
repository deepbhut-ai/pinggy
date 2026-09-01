"""Announcements table — admin messages shown to users on the dashboard.

Revision ID: 0014
Revises: 0013
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS announcements (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title       VARCHAR(200) NOT NULL,
            body        TEXT NOT NULL,
            level       VARCHAR(20) NOT NULL DEFAULT 'info',  -- info|warning|success
            active      BOOLEAN NOT NULL DEFAULT TRUE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active, created_at DESC);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS announcements;")
