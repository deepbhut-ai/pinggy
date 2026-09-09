"""Email templates table — admin-editable dynamic email templates.

Revision ID: 0029
Revises: 0028
Create Date: 2026-09-09
"""
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_templates (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            key             VARCHAR(40) NOT NULL UNIQUE,
            name            VARCHAR(100) NOT NULL,
            description     TEXT,
            subject         VARCHAR(500) NOT NULL,
            body            TEXT NOT NULL,
            placeholders    TEXT,
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            is_system       BOOLEAN NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates(key);"
    )

    # Seed all default templates
    op.execute(
        """
        INSERT INTO email_templates (key, name, description, subject, body, placeholders, is_system) VALUES
        (
            'welcome',
            'Welcome Email',
            'Sent to new users right after they sign up.',
            'Welcome to IRAGT ⚡',
            'Hi {name},

Your IRAGT account is ready. Run your first tunnel:

  ssh -p {ssh_port} -R0:localhost:8080 <your-token>@{ssh_host}

Happy tunneling!',
            'name, ssh_port, ssh_host',
            TRUE
        ),
        (
            'otp',
            '2FA Verification Code',
            'Sent when a user with 2FA enabled logs in — contains the 6-digit OTP code.',
            'IRAGT verification code: {code}',
            'Your IRAGT login verification code is: {code}

It expires in 5 minutes. If you didn''t try to log in, reset your password immediately.',
            'code',
            TRUE
        ),
        (
            'login',
            'Login Alert',
            'Sent after every successful login to notify the user.',
            'New login to your IRAGT account',
            'Hi,

A successful login to your IRAGT account just occurred.
If this wasn''t you, reset your password immediately from the login page.

Tip: enable Two-Factor Authentication from your dashboard for extra security.',
            '',
            TRUE
        ),
        (
            'reset',
            'Password Reset',
            'Sent when a user requests a password reset — contains the reset link.',
            'Reset your Tunnel password',
            'Hi,

Use this link to reset your password (valid {minutes} minutes):
{base_url}/login?reset={token}

If you didn''t request this, ignore this email.',
            'token, minutes, base_url',
            TRUE
        ),
        (
            'tunnel_stopped',
            'Tunnel Disconnected',
            'Sent when a user''s tunnel gets disconnected.',
            'Your tunnel was stopped',
            'Your tunnel {subdomain} has been disconnected.
Re-run your SSH command to start a new tunnel.',
            'subdomain',
            TRUE
        ),
        (
            'apikey',
            'API Key Created',
            'Sent when a user creates a new API key.',
            'Your IRAGT API key was created',
            'Hi {email},

An API key ''{key_name}'' ({key_prefix}…) was just created on your IRAGT account.
The full key was shown once in your dashboard — copy it from there if you haven''t already.

If this wasn''t you, revoke the key immediately under Dashboard → API Keys.',
            'email, key_name, key_prefix',
            TRUE
        ),
        (
            'ticket',
            'Support Ticket Reply',
            'Sent to the ticket owner when staff replies to a support ticket.',
            'Re: your IRAGT support ticket — {ticket_id}',
            'Support replied to your ticket.

{message}

View the full conversation in your dashboard → Support.',
            'ticket_id, message',
            TRUE
        ),
        (
            'digest',
            'Weekly Usage Digest',
            'Sent weekly to summarize tunnel activity.',
            'Your IRAGT weekly digest — {requests} requests',
            'Your IRAGT week in review:

  • Requests served:  {requests}
  • Data transferred: {data_gb} GB
  • Tunnel addresses: {tunnels}
  • Active tokens:    {tokens}

Manage everything at your IRAGT dashboard.',
            'requests, data_gb, tunnels, tokens',
            TRUE
        )
        ON CONFLICT (key) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS email_templates;")