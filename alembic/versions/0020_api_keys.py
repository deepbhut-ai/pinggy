"""api_keys — programmatic dashboard access (CI/scripts) with hashed keys

Revision ID: 0020
Revises: 0019
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS api_keys (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_email  VARCHAR(255) NOT NULL,
            name        VARCHAR(120) NOT NULL,
            key_hash    VARCHAR(64) NOT NULL UNIQUE,   -- sha256(raw); raw shown once
            prefix      VARCHAR(8) NOT NULL,           -- for identification
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_used_at TIMESTAMPTZ
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_email);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS api_keys;")
