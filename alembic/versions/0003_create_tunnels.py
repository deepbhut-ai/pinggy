"""create tunnels table

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-17
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tunnels (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tunnel_id       VARCHAR(20) UNIQUE NOT NULL,
            subdomain       VARCHAR(50) UNIQUE NOT NULL,
            remote_port     INTEGER NOT NULL,
            local_port      INTEGER NOT NULL,
            protocol        VARCHAR(10) NOT NULL DEFAULT 'http',
            user_email      VARCHAR(255),
            ssh_peer        VARCHAR(100),
            status          VARCHAR(20) NOT NULL DEFAULT 'active',
            request_count   INTEGER NOT NULL DEFAULT 0,
            bytes_transferred BIGINT NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            closed_at       TIMESTAMPTZ
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_tunnels_subdomain ON tunnels(subdomain);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_tunnels_status ON tunnels(status);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tunnels;")