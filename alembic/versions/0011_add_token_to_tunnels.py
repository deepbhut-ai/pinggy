"""add tunnels.token column linking tunnels to the token that created them

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE tunnels
        ADD COLUMN IF NOT EXISTS token VARCHAR(64);
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_tunnels_token ON tunnels(token);")
    # Best-effort backfill: match historical tunnels to the user's current token
    # (users.tunnel_token legacy column / tokens table).
    op.execute(
        """
        UPDATE tunnels t
        SET token = u.tunnel_token
        FROM users u
        WHERE t.user_email = u.email
          AND u.tunnel_token IS NOT NULL
          AND t.token IS NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_tunnels_token;")
    op.execute("ALTER TABLE tunnels DROP COLUMN IF EXISTS token;")
