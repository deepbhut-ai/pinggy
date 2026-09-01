"""persistent subdomains — tokens own a fixed, editable subdomain

Revision ID: 0019
Revises: 0018
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE tokens
        ADD COLUMN IF NOT EXISTS fixed_subdomain VARCHAR(50) UNIQUE;
        """
    )
    # Backfill: derive stable subdomains for existing tokens (same hash the
    # dashboard already displays), so URLs stop changing on reconnect.
    op.execute(
        """
        UPDATE tokens
        SET fixed_subdomain = substr(md5(token), 1, 7)
        WHERE fixed_subdomain IS NULL;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE tokens DROP COLUMN IF EXISTS fixed_subdomain;")
