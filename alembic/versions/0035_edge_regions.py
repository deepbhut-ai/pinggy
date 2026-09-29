"""0035 — create regions table with default India server seed

Revision ID: 0035
Revises: 0034
Create Date: 2026-09-28
"""
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS regions (
        code VARCHAR(20) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        flag VARCHAR(10) DEFAULT '🌐',
        server_ip VARCHAR(45) NOT NULL,
        ssh_host VARCHAR(255) NOT NULL,
        ssh_port INT DEFAULT 2222,
        proxy_domain VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_maintenance BOOLEAN NOT NULL DEFAULT FALSE,
        max_capacity INT DEFAULT 1000,
        sort_order INT DEFAULT 0,
        node_secret VARCHAR(64) DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """)

    # Ensure node_secret column exists even if table was created in earlier partial migration
    op.execute("""
    ALTER TABLE regions ADD COLUMN IF NOT EXISTS node_secret VARCHAR(64) DEFAULT '';
    """)

    # Seed initial primary region (current live server)
    op.execute("""
    INSERT INTO regions (code, name, flag, server_ip, ssh_host, ssh_port, proxy_domain, is_active, is_maintenance, max_capacity, sort_order)
    VALUES ('in', 'Asia South (India)', '🇮🇳', '13.140.131.204', 'ssh.iraglobaltech.com', 2222, 'iraglobaltech.com', TRUE, FALSE, 1000, 1)
    ON CONFLICT (code) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS regions;")
