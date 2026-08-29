"""invoices table — auto-generated for paid payments

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invoices (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            invoice_no    VARCHAR(24) UNIQUE NOT NULL,
            user_email    VARCHAR(255) NOT NULL,
            payment_id    UUID,
            plan          VARCHAR(20) NOT NULL,
            seats         INT NOT NULL DEFAULT 1,
            coupon_code   VARCHAR(32),
            amount        NUMERIC(10,2) NOT NULL,
            currency      VARCHAR(10) NOT NULL DEFAULT 'INR',
            status        VARCHAR(20) NOT NULL DEFAULT 'paid',
            issued_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_email);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_invoices_issued ON invoices(issued_at DESC);")
    # one invoice per payment — unique constraint (also the ON CONFLICT target)
    op.execute("ALTER TABLE invoices ADD CONSTRAINT uq_invoices_payment UNIQUE (payment_id);")


def downgrade() -> None:
    op.execute("ALTER TABLE invoices DROP CONSTRAINT IF EXISTS uq_invoices_payment;")
    op.execute("DROP TABLE IF EXISTS invoices;")
