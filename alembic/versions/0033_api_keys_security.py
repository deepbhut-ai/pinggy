"""0033 — api_keys security: add is_active column, drop key_plain column

Security fixes (v2.8.5):
- Add is_active BOOLEAN DEFAULT TRUE for soft-delete (revoke = soft-delete, keeps audit trail)
- Drop key_plain column (raw API keys were stored in cleartext — DB compromise leaked all keys)
- Backfill: all existing keys are marked is_active=TRUE (already in DB, none were revoked)

Revision ID: 0033
Revises: 0032
Create Date: 2026-09-14
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add is_active column (soft-delete support)
    op.execute("ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (is_active)")

    # 2. Drop key_plain column (plaintext key storage — security risk)
    op.execute("ALTER TABLE api_keys DROP COLUMN IF EXISTS key_plain")


def downgrade() -> None:
    # Re-add key_plain (nullable — old keys won't have it)
    op.execute("ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_plain VARCHAR(255) NULL")
    op.execute("DROP INDEX IF EXISTS idx_api_keys_active")
    op.execute("ALTER TABLE api_keys DROP COLUMN IF EXISTS is_active")