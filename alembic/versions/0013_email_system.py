"""email system: SMTP settings keys, email_logs, password reset tokens

Revision ID: 0013
Revises: 0012
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_logs (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            to_email    VARCHAR(255) NOT NULL,
            subject     VARCHAR(500) NOT NULL,
            kind        VARCHAR(40)  NOT NULL,   -- welcome|reset|tunnel_stopped|campaign|test
            status      VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending|sent|failed
            error       TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_email_logs_kind ON email_logs(kind);")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS password_resets (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_email  VARCHAR(255) NOT NULL,
            token_hash  VARCHAR(64) NOT NULL UNIQUE,
            expires_at  TIMESTAMPTZ NOT NULL,
            used_at     TIMESTAMPTZ,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_pwresets_email ON password_resets(user_email);")
    # payments.coupon_code — column the v0.4.0 code already writes (defensively)
    op.execute(
        """
        ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(32);
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE payments DROP COLUMN IF EXISTS coupon_code;")
    op.execute("DROP TABLE IF EXISTS password_resets;")
    op.execute("DROP TABLE IF EXISTS email_logs;")
