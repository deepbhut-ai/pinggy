"""multi-domains per token + teams + tickets

Revision ID: 0023
Revises: 0022
Create Date: 2026-08-30
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Multiple custom domains per token (tokens.custom_domain stays as primary)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS token_domains (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id    UUID NOT NULL,
            domain      VARCHAR(255) UNIQUE NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_tokendomains_token ON token_domains(token_id);")
    # Teams
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS teams (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        VARCHAR(120) NOT NULL,
            owner_email VARCHAR(255) NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS team_members (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            user_email  VARCHAR(255) NOT NULL,
            role        VARCHAR(20) NOT NULL DEFAULT 'member',  -- member | admin
            added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (team_id, user_email)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_teammembers_team ON team_members(team_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_teammembers_user ON team_members(user_email);")
    # Team-owned tokens
    op.execute("ALTER TABLE tokens ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;")
    # Support tickets
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tickets (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_email  VARCHAR(255) NOT NULL,
            subject     VARCHAR(200) NOT NULL,
            status      VARCHAR(20) NOT NULL DEFAULT 'open',   -- open|answered|closed
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ticket_messages (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            sender_email VARCHAR(255) NOT NULL,
            is_staff    BOOLEAN NOT NULL DEFAULT FALSE,
            body        TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_email);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, updated_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ticketmsgs_ticket ON ticket_messages(ticket_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ticket_messages;")
    op.execute("DROP TABLE IF EXISTS tickets;")
    op.execute("ALTER TABLE tokens DROP COLUMN IF EXISTS team_id;")
    op.execute("DROP TABLE IF EXISTS team_members;")
    op.execute("DROP TABLE IF EXISTS teams;")
    op.execute("DROP TABLE IF EXISTS token_domains;")
