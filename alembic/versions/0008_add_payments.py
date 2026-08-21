"""add plan_expires_at and payments table

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-21
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users.plan_expires_at: when the pro subscription ends
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
        """
    )
    # payments: record of every payment attempt/transaction
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS payments (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_email      VARCHAR(255) NOT NULL,
            method          VARCHAR(20) NOT NULL,        -- stripe | paypal | nowpayments
            plan            VARCHAR(20) NOT NULL,        -- pro
            amount          NUMERIC(10,2) NOT NULL,
            currency        VARCHAR(10) NOT NULL DEFAULT 'INR',
            status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|paid|failed|expired
            provider_ref    VARCHAR(255),                -- payment intent / order id / invoice id
            provider_payload TEXT,                       -- raw webhook/checkout payload (JSON)
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_email);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(provider_ref);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS payments;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS plan_expires_at;")