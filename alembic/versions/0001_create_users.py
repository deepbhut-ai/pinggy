"""create users table

Revision ID: 0001
Revises:
Create Date: 2026-08-17
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email        VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name    VARCHAR(120),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS users;")