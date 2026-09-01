"""remove enterprise plan

Revision ID: 0026
Revises: 0025
Create Date: 2026-09-01
"""
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM plans WHERE id = 'enterprise'")


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO plans (id, name, price_inr, price_usd, tagline, features,
                           cta_label, popular, active, sort_order)
        VALUES (
            'enterprise', 'Enterprise', 0, 0,
            'For teams that need dedicated infrastructure',
            E'Everything in Pro plan\nUnlimited persistent tunnels\nUnlimited custom domains\nDedicated servers\nAPI to manage tunnels\nPriority call support',
            'Contact Sales', FALSE, TRUE, 3
        )
        ON CONFLICT (id) DO NOTHING
        """
    )
