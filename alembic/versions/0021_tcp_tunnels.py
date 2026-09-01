"""TCP tunnels — persistent port allocation per token (Pro)

Revision ID: 0021
Revises: 0020
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE tokens
        ADD COLUMN IF NOT EXISTS tunnel_mode VARCHAR(10) NOT NULL DEFAULT 'http',  -- http | tcp
        ADD COLUMN IF NOT EXISTS tcp_port     INTEGER UNIQUE;                       -- persistent port (Pro)
        """
    )
    # Grant existing Pro users a persistent TCP port (none yet — users opt in)


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE tokens
        DROP COLUMN IF EXISTS tunnel_mode,
        DROP COLUMN IF EXISTS tcp_port;
        """
    )
