"""add role column and default admin user

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-17
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add role column with default 'user'
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
        """
    )
    # Add index on role for fast filtering
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_users_role;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS role;")