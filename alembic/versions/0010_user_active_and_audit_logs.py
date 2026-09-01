"""add users.is_active and audit_logs table

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users.is_active — admin can disable an account (blocks login, API and SSH)
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
        """
    )
    # audit_logs — who did what, when (admin actions, registrations, config changes)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            actor_email VARCHAR(255) NOT NULL,
            action      VARCHAR(50)  NOT NULL,
            target      VARCHAR(255),
            details     TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_email);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_logs;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_active;")
