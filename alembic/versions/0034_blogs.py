"""0034 — create blogs table with seed data

Revision ID: 0034
Revises: 0033
Create Date: 2026-09-15
"""
from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS blogs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(200) UNIQUE NOT NULL,
        title VARCHAR(300) NOT NULL,
        summary TEXT,
        content TEXT NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'Engineering',
        author VARCHAR(100) NOT NULL DEFAULT 'IRAGT Team',
        read_time VARCHAR(50) NOT NULL DEFAULT '5 min read',
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        published BOOLEAN NOT NULL DEFAULT TRUE,
        published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs (slug);
    CREATE INDEX IF NOT EXISTS idx_blogs_published ON blogs (published, published_at DESC);
    """)

    # Seed initial posts
    op.execute("""
    INSERT INTO blogs (slug, title, summary, content, category, author, read_time, featured, published)
    VALUES
    (
        'ssh-localhost-in-one-command',
        'Get a Public URL for Localhost in One SSH Command',
        'Learn how to expose any local service without installing a client. Works on Windows, macOS, and Linux.',
        '<p>IRAGT lets you expose any service running on your local machine to the internet using nothing but SSH. No binary downloads, no config files, and no firewall rules. This guide walks you through your first tunnel.</p><h2>What you need</h2><ul><li>A machine with an SSH client installed (Windows 10/11, macOS, and Linux all ship with one).</li><li>An IRAGT account — you can register at <a href="/login">/login</a>.</li><li>A local service listening on a port, for example <code>localhost:8080</code>.</li></ul><h2>The command</h2><p>Once you have an access token, copy the command from your dashboard or build it yourself:</p><pre><code>ssh -p 2222 -R0:127.0.0.1:8080 your-token@ssh.iraglobaltech.com</code></pre><div class="ptip"><strong>Tip</strong> Replace <code>8080</code> with whatever port your app uses. The token field is the short access token shown in your IRAGT dashboard.</div><h2>What happens next</h2><p>After a successful connection, IRAGT assigns you a public HTTPS URL. It will look something like:</p><pre><code>https://your-name.iraglobaltech.com</code></pre><p>Any request sent to that URL is forwarded through the SSH tunnel directly to <code>localhost:8080</code>. Your local app does not need to know it is being accessed from the internet.</p><h2>Windows users</h2><p>If you are using Windows PowerShell, the command is the same. For older Windows versions you can use PuTTY with an equivalent remote port forward, or simply enable the OpenSSH client from Windows Optional Features.</p><h2>Next steps</h2><p>Now that your first tunnel is running, try adding a custom domain, enabling HTTP basic auth, or inviting teammates to share the token. You can manage all of this from the <a href="/dashboard">IRAGT dashboard</a>.</p>',
        'Tutorial',
        'IRAGT Team',
        '4 min read',
        TRUE,
        TRUE
    ),
    (
        'http-auth-ip-whitelists',
        'Protecting Tunnels with HTTP Auth & IP Whitelists',
        'Lock down your tunnels using built-in Basic Auth, Bearer tokens, IP restrictions, and HTTPS-only mode.',
        '<p>Public tunnels are convenient, but convenience should never come at the cost of security. IRAGT gives you several ways to restrict who can reach your exposed services without touching your local application code.</p><h2>HTTP Basic Authentication</h2><p>The fastest way to add a password gate is Basic Auth. You can turn it on from the dashboard under a tunnel''s settings. IRAGT then intercepts every incoming request and rejects it if the credentials do not match.</p><pre><code>ssh -p 2222 -R0:127.0.0.1:8080 -o ServerAliveInterval=30 token@ssh.iraglobaltech.com</code></pre><p>When Basic Auth is enabled, visitors see a browser prompt before they can access your app. This is ideal for demos, staging environments, and quick reviews.</p><h2>Bearer tokens and API access</h2><p>For programmatic access, you can require a Bearer token in the <code>Authorization</code> header. This is especially useful when your tunnel is receiving webhooks from services like GitHub, Stripe, or Twilio.</p><ul><li>Generate scoped tokens from the <a href="/dashboard">Dashboard</a>.</li><li>Attach them to specific tunnels or subdomains.</li><li>Rotate tokens instantly if one is leaked.</li></ul><h2>IP whitelisting</h2><p>If you only want specific networks to reach your tunnel, add an IP allow-list. Only requests coming from those addresses will be forwarded; everything else is dropped at the edge before it ever reaches your local machine.</p><div class="ptip"><strong>Best practice</strong> Combine IP whitelisting with HTTPS-only mode for the strongest default posture when exposing internal tools.</div><h2>HTTPS-only mode</h2><p>IRAGT provides free HTTPS on every tunnel. With HTTPS-only mode enabled, plain HTTP requests are automatically redirected to the secure endpoint. This protects credentials and payload data in transit.</p><h2>Audit everything</h2><p>Every authentication failure and allowed request is logged in your dashboard. Use the logs to detect scanning attempts, monitor usage, and prove compliance.</p>',
        'Security',
        'IRAGT Team',
        '5 min read',
        TRUE,
        TRUE
    ),
    (
        'custom-domain-iragt',
        'Using Your Own Custom Domain with IRAGT',
        'Point your domain to IRAGT, configure Cloudflare Flexible SSL, and get a branded tunnel URL.',
        '<p>A branded domain builds trust with users and clients. IRAGT makes it easy to use your own domain for any tunnel.</p><h2>Point your DNS</h2><p>Create a CNAME record pointing your desired subdomain to the IRAGT edge domain shown in your dashboard.</p><pre><code>CNAME app.yourdomain.com → cname.iraglobaltech.com</code></pre><h2>Add the domain in IRAGT</h2><p>Open <a href="/dashboard/domains">Domains</a>, enter your subdomain, and verify DNS. Once verified, assign the domain to any tunnel.</p>',
        'Domains',
        'IRAGT Team',
        '6 min read',
        FALSE,
        TRUE
    ),
    (
        'built-in-web-debugger',
        'Introducing the Built-in Web Debugger',
        'Inspect, modify, and replay HTTP requests right from your IRAGT dashboard. No extra tools needed.',
        '<p>The IRAGT Web Debugger lets you inspect every request that travels through your tunnel. You can view headers, bodies, replay requests, and export logs.</p><h2>Open the debugger</h2><p>Go to <a href="/dashboard/inspector">Inspector</a> while a tunnel is active. Requests appear in real time.</p><div class="ptip"><strong>Pro tip</strong> Filter by method or status to quickly find the request you are debugging.</div>',
        'Product',
        'IRAGT Team',
        '3 min read',
        FALSE,
        TRUE
    ),
    (
        'team-seats-api-keys',
        'Managing Team Seats and API Keys',
        'Add teammates, share tokens safely, and audit access using scoped API keys and role-based controls.',
        '<p>Invite colleagues to your IRAGT team and assign roles from the <a href="/dashboard/teams">Teams</a> page. Each member gets their own login without sharing the owner account.</p><h2>Scoped API keys</h2><p>Create API keys limited to specific actions — read tunnels, manage domains, or view billing. If a key leaks, revoke it instantly.</p>',
        'Teams',
        'IRAGT Team',
        '4 min read',
        FALSE,
        TRUE
    ),
    (
        'faster-local-development-workflows',
        '5 Tips for Faster Local Development Workflows',
        'From persistent subdomains to quick-copy commands, streamline how you test and share your apps.',
        '<p>Small workflow improvements add up. Here are five ways to move faster with IRAGT.</p><ul><li>Use persistent subdomains so webhooks do not break on reconnect.</li><li>Save your SSH command as a shell alias.</li><li>Enable auto-reconnect with <code>ServerAliveInterval=30</code>.</li><li>Pin the dashboard to your browser for one-click tunnel management.</li><li>Share read-only links with stakeholders.</li></ul>',
        'Tips',
        'IRAGT Team',
        '3 min read',
        FALSE,
        TRUE
    ),
    (
        'webhook-testing-persistent-subdomains',
        'Webhook Testing with Persistent Subdomains',
        'Stop reconfiguring third-party services. Use a fixed public URL that survives reconnections.',
        '<p>Third-party webhooks require a stable URL. A free tunnel URL changes on every connection, which makes local webhook testing painful.</p><h2>Reserve a subdomain</h2><p>From the dashboard, reserve a persistent subdomain. Every time you connect with your token, IRAGT gives you the same public URL.</p><div class="ptip"><strong>Tip</strong> Combine with IP whitelisting so only your webhook provider can hit the endpoint.</div>',
        'Integration',
        'IRAGT Team',
        '4 min read',
        FALSE,
        TRUE
    ),
    (
        'monitoring-tunnel-traffic',
        'Monitoring Tunnel Traffic and Bandwidth',
        'Track bytes sent/received, active connections, and request logs from your dashboard.',
        '<p>Visibility into tunnel usage helps you optimize performance and spot issues early.</p><h2>Real-time metrics</h2><p>The <a href="/dashboard/tunnels">Active Tunnels</a> page shows current connections, total bytes sent/received, and request counts.</p><h2>Bandwidth history</h2><p>Visit <a href="/dashboard/usage">My Usage</a> to see daily and monthly bandwidth trends for your account.</p>',
        'Usage',
        'IRAGT Team',
        '5 min read',
        FALSE,
        TRUE
    )
    ON CONFLICT (slug) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS blogs CASCADE;")
