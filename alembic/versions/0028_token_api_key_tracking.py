"""Add created_by_api_key column to tokens

Revision ID: 0028
Revises: 0027
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tokens", sa.Column("created_by_api_key", sa.String(36), nullable=True))


def downgrade() -> None:
    op.drop_column("tokens", "created_by_api_key")