"""Add unique constraint on tunnel_configs (user_email, name) for multi-port upsert.

Revision ID: 0030
Revises: 0029
Create Date: 2026-09-10
"""
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tconfigs_user_name ON tunnel_configs(user_email, name);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_tconfigs_user_name;")