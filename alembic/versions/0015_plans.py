"""plans table (editable pricing/features) + seed free/pro/enterprise

Revision ID: 0015
Revises: 0014
Create Date: 2026-08-29
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS plans (
            id           VARCHAR(20) PRIMARY KEY,       -- free | pro | enterprise
            name         VARCHAR(50) NOT NULL,
            price_inr    NUMERIC(10,2) NOT NULL DEFAULT 0,
            price_usd    NUMERIC(10,2) NOT NULL DEFAULT 0,
            tagline      VARCHAR(200),
            features     TEXT,                           -- newline-separated list
            cta_label    VARCHAR(50) DEFAULT 'Get Started',
            popular      BOOLEAN NOT NULL DEFAULT FALSE,
            active       BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order   INT NOT NULL DEFAULT 0,
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        INSERT INTO plans (id, name, price_inr, price_usd, tagline, features, cta_label, popular, active, sort_order)
        VALUES
          ('free', 'Free', 0, 0, 'Free for life',
           E'Single command tunneling\nHTTP(S) tunnels\n60 minutes tunnel timeout\nRandom subdomains\nUnlimited data transfer',
           'Get Started Free', FALSE, TRUE, 1),
          ('pro', 'Pro', 199, 2.99, 'For developers who need more',
           E'Everything in Free plan\nPersistent tunnels (no timeout)\nFixed subdomain per token\nCustom domains: $3 / ₹300/month top-up (unlimited while active)\nMultiple tunnels\nPriority support',
           'Upgrade to Pro', TRUE, TRUE, 2),
          ('enterprise', 'Enterprise', 0, 0, 'For teams that need dedicated infrastructure',
           E'Everything in Pro plan\nUnlimited persistent tunnels\nUnlimited custom domains\nDedicated servers\nAPI to manage tunnels\nPriority call support',
           'Contact Sales', FALSE, TRUE, 3)
        ON CONFLICT (id) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS plans;")
