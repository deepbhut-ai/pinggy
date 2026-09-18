export const blogPosts = [
  {
    slug: 'ssh-localhost-in-one-command',
    tag: 'Tutorial',
    emoji: '🚀',
    featured: true,
    title: 'Get a Public URL for Localhost in One SSH Command',
    meta: 'June 10, 2024 · 4 min read',
    desc: 'Learn how to expose any local service without installing a client. Works on Windows, macOS, and Linux.',
    content: () => (
      <>
        <p>IRAGT lets you expose any service running on your local machine to the internet using nothing but SSH. No binary downloads, no config files, and no firewall rules. This guide walks you through your first tunnel.</p>

        <h2>What you need</h2>
        <ul>
          <li>A machine with an SSH client installed (Windows 10/11, macOS, and Linux all ship with one).</li>
          <li>An IRAGT account — you can register at <a href="/login">/login</a>.</li>
          <li>A local service listening on a port, for example <code>localhost:8080</code>.</li>
        </ul>

        <h2>The command</h2>
        <p>Once you have an access token, copy the command from your dashboard or build it yourself:</p>
        <pre><code>ssh -p 2222 -R0:127.0.0.1:8080 your-token@ssh.iraglobaltech.com</code></pre>

        <div className="ptip">
          <strong>Tip</strong>
          Replace <code>8080</code> with whatever port your app uses. The token field is the short access token shown in your IRAGT dashboard.
        </div>

        <h2>What happens next</h2>
        <p>After a successful connection, IRAGT assigns you a public HTTPS URL. It will look something like:</p>
        <pre><code>https://your-name.iraglobaltech.com</code></pre>
        <p>Any request sent to that URL is forwarded through the SSH tunnel directly to <code>localhost:8080</code>. Your local app does not need to know it is being accessed from the internet.</p>

        <h2>Windows users</h2>
        <p>If you are using Windows PowerShell, the command is the same. For older Windows versions you can use PuTTY with an equivalent remote port forward, or simply enable the OpenSSH client from Windows Optional Features.</p>

        <h2>Next steps</h2>
        <p>Now that your first tunnel is running, try adding a custom domain, enabling HTTP basic auth, or inviting teammates to share the token. You can manage all of this from the <a href="/dashboard">IRAGT dashboard</a>.</p>
      </>
    ),
  },
  {
    slug: 'http-auth-ip-whitelists',
    tag: 'Security',
    emoji: '🔒',
    featured: true,
    title: 'Protecting Tunnels with HTTP Auth & IP Whitelists',
    meta: 'June 5, 2024 · 5 min read',
    desc: 'Lock down your tunnels using built-in Basic Auth, Bearer tokens, IP restrictions, and HTTPS-only mode.',
    content: () => (
      <>
        <p>Public tunnels are convenient, but convenience should never come at the cost of security. IRAGT gives you several ways to restrict who can reach your exposed services without touching your local application code.</p>

        <h2>HTTP Basic Authentication</h2>
        <p>The fastest way to add a password gate is Basic Auth. You can turn it on from the dashboard under a tunnel's settings. IRAGT then intercepts every incoming request and rejects it if the credentials do not match.</p>
        <pre><code>ssh -p 2222 -R0:127.0.0.1:8080 -o ServerAliveInterval=30 token@ssh.iraglobaltech.com</code></pre>
        <p>When Basic Auth is enabled, visitors see a browser prompt before they can access your app. This is ideal for demos, staging environments, and quick reviews.</p>

        <h2>Bearer tokens and API access</h2>
        <p>For programmatic access, you can require a Bearer token in the <code>Authorization</code> header. This is especially useful when your tunnel is receiving webhooks from services like GitHub, Stripe, or Twilio.</p>
        <ul>
          <li>Generate scoped tokens from the <a href="/dashboard">Dashboard</a>.</li>
          <li>Attach them to specific tunnels or subdomains.</li>
          <li>Rotate tokens instantly if one is leaked.</li>
        </ul>

        <h2>IP whitelisting</h2>
        <p>If you only want specific networks to reach your tunnel, add an IP allow-list. Only requests coming from those addresses will be forwarded; everything else is dropped at the edge before it ever reaches your local machine.</p>
        <div className="ptip">
          <strong>Best practice</strong>
          Combine IP whitelisting with HTTPS-only mode for the strongest default posture when exposing internal tools.
        </div>

        <h2>HTTPS-only mode</h2>
        <p>IRAGT provides free HTTPS on every tunnel. With HTTPS-only mode enabled, plain HTTP requests are automatically redirected to the secure endpoint. This protects credentials and payload data in transit.</p>

        <h2>Audit everything</h2>
        <p>Every authentication failure and allowed request is logged in your dashboard. Use the logs to detect scanning attempts, monitor usage, and prove compliance.</p>
      </>
    ),
  },
  {
    slug: 'custom-domain-iragt',
    tag: 'Domains',
    emoji: '🌐',
    title: 'Using Your Own Custom Domain with IRAGT',
    meta: 'May 28, 2024 · 6 min read',
    desc: 'Point your domain to IRAGT, configure Cloudflare Flexible SSL, and get a branded tunnel URL.',
    content: () => (
      <>
        <p>A branded domain builds trust with users and clients. IRAGT makes it easy to use your own domain for any tunnel.</p>
        <h2>Point your DNS</h2>
        <p>Create a CNAME record pointing your desired subdomain to the IRAGT edge domain shown in your dashboard.</p>
        <pre><code>CNAME app.yourdomain.com → cname.iraglobaltech.com</code></pre>
        <h2>Add the domain in IRAGT</h2>
        <p>Open <a href="/dashboard/domains">Domains</a>, enter your subdomain, and verify DNS. Once verified, assign the domain to any tunnel.</p>
      </>
    ),
  },
  {
    slug: 'built-in-web-debugger',
    tag: 'Product',
    emoji: '⚡',
    title: 'Introducing the Built-in Web Debugger',
    meta: 'May 20, 2024 · 3 min read',
    desc: 'Inspect, modify, and replay HTTP requests right from your IRAGT dashboard. No extra tools needed.',
    content: () => (
      <>
        <p>The IRAGT Web Debugger lets you inspect every request that travels through your tunnel. You can view headers, bodies, replay requests, and export logs.</p>
        <h2>Open the debugger</h2>
        <p>Go to <a href="/dashboard/inspector">Inspector</a> while a tunnel is active. Requests appear in real time.</p>
        <div className="ptip"><strong>Pro tip</strong>Filter by method or status to quickly find the request you are debugging.</div>
      </>
    ),
  },
  {
    slug: 'team-seats-api-keys',
    tag: 'Teams',
    emoji: '🧑‍💻',
    title: 'Managing Team Seats and API Keys',
    meta: 'May 12, 2024 · 4 min read',
    desc: 'Add teammates, share tokens safely, and audit access using scoped API keys and role-based controls.',
    content: () => (
      <>
        <p>Invite colleagues to your IRAGT team and assign roles from the <a href="/dashboard/teams">Teams</a> page. Each member gets their own login without sharing the owner account.</p>
        <h2>Scoped API keys</h2>
        <p>Create API keys limited to specific actions — read tunnels, manage domains, or view billing. If a key leaks, revoke it instantly.</p>
      </>
    ),
  },
  {
    slug: 'faster-local-development-workflows',
    tag: 'Tips',
    emoji: '💡',
    title: '5 Tips for Faster Local Development Workflows',
    meta: 'May 1, 2024 · 3 min read',
    desc: 'From persistent subdomains to quick-copy commands, streamline how you test and share your apps.',
    content: () => (
      <>
        <p>Small workflow improvements add up. Here are five ways to move faster with IRAGT.</p>
        <ul>
          <li>Use persistent subdomains so webhooks do not break on reconnect.</li>
          <li>Save your SSH command as a shell alias.</li>
          <li>Enable auto-reconnect with <code>ServerAliveInterval=30</code>.</li>
          <li>Pin the dashboard to your browser for one-click tunnel management.</li>
          <li>Share read-only links with stakeholders.</li>
        </ul>
      </>
    ),
  },
  {
    slug: 'webhook-testing-persistent-subdomains',
    tag: 'Integration',
    emoji: '🛠️',
    title: 'Webhook Testing with Persistent Subdomains',
    meta: 'April 22, 2024 · 4 min read',
    desc: 'Stop reconfiguring third-party services. Use a fixed public URL that survives reconnections.',
    content: () => (
      <>
        <p>Third-party webhooks require a stable URL. A free tunnel URL changes on every connection, which makes local webhook testing painful.</p>
        <h2>Reserve a subdomain</h2>
        <p>From the dashboard, reserve a persistent subdomain. Every time you connect with your token, IRAGT gives you the same public URL.</p>
        <div className="ptip"><strong>Tip</strong>Combine with IP whitelisting so only your webhook provider can hit the endpoint.</div>
      </>
    ),
  },
  {
    slug: 'monitoring-tunnel-traffic',
    tag: 'Usage',
    emoji: '📊',
    title: 'Monitoring Tunnel Traffic and Bandwidth',
    meta: 'April 10, 2024 · 5 min read',
    desc: 'Track bytes sent/received, active connections, and request logs from your dashboard.',
    content: () => (
      <>
        <p>Visibility into tunnel usage helps you optimize performance and spot issues early.</p>
        <h2>Real-time metrics</h2>
        <p>The <a href="/dashboard/tunnels">Active Tunnels</a> page shows current connections, total bytes sent/received, and request counts.</p>
        <h2>Bandwidth history</h2>
        <p>Visit <a href="/dashboard/usage">My Usage</a> to see daily and monthly bandwidth trends for your account.</p>
      </>
    ),
  },
];

export function getPostBySlug(slug) {
  return blogPosts.find((p) => p.slug === slug);
}
