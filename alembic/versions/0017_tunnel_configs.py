"""tunnel_configs — saved command-builder configurations per user

Revision ID: 0017
Revises: 0016
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tunnel_configs (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_email  VARCHAR(255) NOT NULL,
            name        VARCHAR(120) NOT NULL,
            config      TEXT NOT NULL,          -- JSON blob of builder settings
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_tconfigs_user ON tunnel_configs(user_email);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tunnel_configs;")
