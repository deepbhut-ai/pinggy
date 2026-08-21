"""create tokens table for multiple tunnels per user

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-21
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tokens (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_email      VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
            token           VARCHAR(64) NOT NULL UNIQUE,
            name            VARCHAR(120),
            custom_domain   VARCHAR(255) UNIQUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_tokens_user_email ON tokens(user_email);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);")

    # Migrate existing tunnel_token from users table into tokens table
    op.execute(
        """
        INSERT INTO tokens (user_email, token, name, custom_domain)
        SELECT email, tunnel_token, 'Default', custom_domain
        FROM users
        WHERE tunnel_token IS NOT NULL
        ON CONFLICT (token) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tokens;")