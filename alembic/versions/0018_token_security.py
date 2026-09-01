"""token-level security options: basic auth, IP whitelist, bearer key, https-only

Revision ID: 0018
Revises: 0017
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE tokens
        ADD COLUMN IF NOT EXISTS basic_auth_user VARCHAR(120),
        ADD COLUMN IF NOT EXISTS basic_auth_pass VARCHAR(120),
        ADD COLUMN IF NOT EXISTS ip_whitelist    TEXT,
        ADD COLUMN IF NOT EXISTS bearer_key      VARCHAR(64),
        ADD COLUMN IF NOT EXISTS https_only      BOOLEAN NOT NULL DEFAULT FALSE;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE tokens
        DROP COLUMN IF EXISTS basic_auth_user,
        DROP COLUMN IF EXISTS basic_auth_pass,
        DROP COLUMN IF EXISTS ip_whitelist,
        DROP COLUMN IF EXISTS bearer_key,
        DROP COLUMN IF EXISTS https_only;
        """
    )
