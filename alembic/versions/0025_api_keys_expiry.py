"""0025 — api_keys.expires_at (optional key expiry)"""
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL")
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys (expires_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_api_keys_expires")
    op.execute("ALTER TABLE api_keys DROP COLUMN IF EXISTS expires_at")
