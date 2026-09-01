"""app_settings table (runtime config: payment keys, SMTP) + coupons table

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

# Keys stored: stripe_secret_key, stripe_webhook_secret, stripe_enabled,
# paypal_client_id, paypal_client_secret, paypal_mode, paypal_enabled,
# nowpayments_api_key, nowpayments_ipn_secret, nowpayments_enabled,
# public_base_url, pro_price_inr, pro_price_usd
SETTING_KEYS = [
    ("stripe_secret_key", "sk_"),           # (key, default when unset → disabled)
    ("stripe_webhook_secret", ""),
    ("stripe_enabled", "false"),
    ("paypal_client_id", ""),
    ("paypal_client_secret", ""),
    ("paypal_mode", "sandbox"),
    ("paypal_enabled", "false"),
    ("nowpayments_api_key", ""),
    ("nowpayments_ipn_secret", ""),
    ("nowpayments_enabled", "false"),
    ("public_base_url", ""),
    ("pro_price_inr", "199"),
    ("pro_price_usd", "2.99"),
]


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key         VARCHAR(64) PRIMARY KEY,
            value       TEXT,
            updated_by  VARCHAR(255),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS coupons (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code           VARCHAR(32) UNIQUE NOT NULL,
            percent_off    INT NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
            max_redemptions INT NOT NULL DEFAULT 0,   -- 0 = unlimited
            redeemed       INT NOT NULL DEFAULT 0,
            active         BOOLEAN NOT NULL DEFAULT TRUE,
            expires_at     TIMESTAMPTZ,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS coupons;")
    op.execute("DROP TABLE IF EXISTS app_settings;")
