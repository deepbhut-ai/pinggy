import { useState } from 'react';
import { Link } from 'react-router-dom';
import { copyToClipboard } from '../utils';

/**
 * Public Guide page — accessible at /guide without login.
 * Covers: Quickstart, SSH command, custom domains, API keys, Python SDK, plans, FAQ.
 */
export default function Guide() {
  const [copied, setCopied] = useState('');
  const [activeSection, setActiveSection] = useState('quickstart');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const copy = (text, id) => {
    copyToClipboard(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const sections = [
    { id: 'quickstart', label: 'Quickstart', icon: '🚀' },
    { id: 'ssh-command', label: 'SSH Command', icon: '📋' },
    { id: 'custom-domains', label: 'Custom Domains', icon: '🌐' },
    { id: 'api-keys', label: 'API Keys', icon: '🔑' },
    { id: 'sdk', label: 'Python SDK', icon: '🐍' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'plans', label: 'Plans', icon: '💳' },
    { id: 'faq', label: 'FAQ', icon: '❓' },
  ];

  return (
    <div className="public-help-page">
      {/* ─── NAVBAR ─── */}
      <nav className="public-nav">
        <div className="public-nav-brand">
          <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>IRAGT</span>
          </a>
        </div>
        <ul className="public-nav-links">
          <li><a href="/#features">Features</a></li>
          <li><a href="/#how">How It Works</a></li>
          <li><Link to="/guide" style={{ fontWeight: 700, color: 'var(--brand)' }}>Guide</Link></li>
        </ul>
        <div className="public-nav-actions">
          <Link to="/login" className="btn">Get Started</Link>
        </div>
        <button className={`public-hamburger ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
          <span></span><span></span><span></span>
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="public-mobile-drawer">
          <ul className="public-mobile-links">
            <li><a href="/#features" onClick={() => setMobileMenuOpen(false)}>Features</a></li>
            <li><a href="/#how" onClick={() => setMobileMenuOpen(false)}>How It Works</a></li>
            <li><Link to="/guide" onClick={() => setMobileMenuOpen(false)}>Guide</Link></li>
            <li><Link to="/login" onClick={() => setMobileMenuOpen(false)}>Get Started</Link></li>
          </ul>
        </div>
      )}

      {/* ─── GUIDE LAYOUT ─── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', gap: '2rem' }}>
        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0, position: 'sticky', top: '2rem', alignSelf: 'flex-start' }}>
          <h3 style={{ fontSize: '.75rem', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '.5rem' }}>Guide</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
            {sections.map(s => (
              <li key={s.id}>
                <button
                  onClick={() => setActiveSection(s.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '.5rem .8rem', border: 'none',
                    background: activeSection === s.id ? 'var(--surface-1)' : 'transparent',
                    color: activeSection === s.id ? 'var(--brand)' : 'var(--text)',
                    borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '.85rem', fontWeight: activeSection === s.id ? 600 : 400,
                    display: 'flex', alignItems: 'center', gap: '.5rem',
                  }}
                >
                  <span>{s.icon}</span> {s.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* ─── QUICKSTART ─── */}
          {activeSection === 'quickstart' && (
            <section>
              <h1>🚀 Quickstart</h1>
              <p className="dim" style={{ fontSize: '.9rem', marginBottom: '1.5rem' }}>Get a live public URL for your local app in under 60 seconds.</p>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Step 1 — Sign up</h2></div>
                <div className="card-body">
                  <p>Create a free account at <Link to="/login" style={{ color: 'var(--brand)' }}>iraglobaltech.com/login</Link>. You'll get a tunnel token immediately.</p>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Step 2 — Run your local app</h2></div>
                <div className="card-body">
                  <p>Start your local dev server (e.g. <span className="code">npm run dev</span> on port 8080, <span className="code">python manage.py runserver</span> on port 8000).</p>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Step 3 — Open a tunnel</h2></div>
                <div className="card-body">
                  <p>Run this in any terminal — no SSH keys, no install:</p>
                  <div className="cmd-box cmd-box-relative">
                    <pre>ssh -p 2222 -R0:127.0.0.1:8080 -o StrictHostKeyChecking=no YOUR_TOKEN@ssh.iraglobaltech.com</pre>
                    <button className="btn btn-sm copy-btn" onClick={() => copy('ssh -p 2222 -R0:127.0.0.1:8080 -o StrictHostKeyChecking=no YOUR_TOKEN@ssh.iraglobaltech.com', 'qs1')}>{copied === 'qs1' ? '✅' : '📋'}</button>
                  </div>
                  <p className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>Replace <span className="code">YOUR_TOKEN</span> with your tunnel token from the dashboard, and <span className="code">8080</span> with your local port.</p>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h2>Step 4 — Get your URL</h2></div>
                <div className="card-body">
                  <p>Your live URL is printed in the terminal immediately:</p>
                  <div className="cmd-box"><pre>✅ Tunnel live: https://abc123.iraglobaltech.com</pre></div>
                  <p className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>Share this URL — anyone can access your local app from anywhere.</p>
                </div>
              </div>
            </section>
          )}

          {/* ─── SSH COMMAND ─── */}
          {activeSection === 'ssh-command' && (
            <section>
              <h1>📋 SSH Command Builder</h1>
              <p className="dim" style={{ fontSize: '.9rem', marginBottom: '1.5rem' }}>The tunnel command is just an SSH reverse port forward. No keys required — your token is the username.</p>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Basic command</h2></div>
                <div className="card-body">
                  <div className="cmd-box cmd-box-relative">
                    <pre>ssh -p 2222 -R0:127.0.0.1:PORT -o StrictHostKeyChecking=no TOKEN@ssh.iraglobaltech.com</pre>
                    <button className="btn btn-sm copy-btn" onClick={() => copy('ssh -p 2222 -R0:127.0.0.1:PORT -o StrictHostKeyChecking=no TOKEN@ssh.iraglobaltech.com', 'ssh1')}>{copied === 'ssh1' ? '✅' : '📋'}</button>
                  </div>
                  <ul style={{ fontSize: '.85rem', marginTop: '1rem', paddingLeft: '1.2rem' }}>
                    <li><strong>-p 2222</strong> — our SSH server port</li>
                    <li><strong>-R0:127.0.0.1:PORT</strong> — reverse forward a random remote port to your local PORT</li>
                    <li><strong>-o StrictHostKeyChecking=no</strong> — skip the host key prompt (first time only)</li>
                    <li><strong>TOKEN</strong> — your tunnel token from the dashboard (used as SSH username)</li>
                  </ul>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Auto-reconnect (bash/zsh)</h2></div>
                <div className="card-body">
                  <p>Keep the tunnel alive even if your network drops:</p>
                  <div className="cmd-box cmd-box-relative">
                    <pre>{`while true; do
  ssh -p 2222 -R0:127.0.0.1:8080 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 TOKEN@ssh.iraglobaltech.com
  echo "Disconnected. Reconnecting in 5s..."
  sleep 5
done`}</pre>
                    <button className="btn btn-sm copy-btn" onClick={() => copy(`while true; do\n  ssh -p 2222 -R0:127.0.0.1:8080 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 TOKEN@ssh.iraglobaltech.com\n  echo "Disconnected. Reconnecting in 5s..."\n  sleep 5\ndone`, 'ssh2')}>{copied === 'ssh2' ? '✅' : '📋'}</button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h2>Auto-reconnect (Windows PowerShell)</h2></div>
                <div className="card-body">
                  <div className="cmd-box cmd-box-relative">
                    <pre>{`while ($true) {
  ssh -p 2222 -R0:127.0.0.1:8080 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 TOKEN@ssh.iraglobaltech.com
  Write-Host "Disconnected. Reconnecting in 5s..."
  Start-Sleep -Seconds 5
}`}</pre>
                    <button className="btn btn-sm copy-btn" onClick={() => copy(`while ($true) { ssh -p 2222 -R0:127.0.0.1:8080 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 TOKEN@ssh.iraglobaltech.com; Write-Host "Disconnected. Reconnecting in 5s..."; Start-Sleep -Seconds 5 }`, 'ssh3')}>{copied === 'ssh3' ? '✅' : '📋'}</button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ─── CUSTOM DOMAINS ─── */}
          {activeSection === 'custom-domains' && (
            <section>
              <h1>🌐 Custom Domains</h1>
              <p className="dim" style={{ fontSize: '.9rem', marginBottom: '1.5rem' }}>Use your own domain instead of a subdomain. Pro plans support unlimited subdomains under your root domains.</p>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Setup steps</h2></div>
                <div className="card-body">
                  <ol style={{ paddingLeft: '1.2rem', fontSize: '.85rem', lineHeight: 1.8 }}>
                    <li><strong>Add a DNS A record</strong> — Point your domain's <span className="code">@</span> record to <span className="code">13.140.131.204</span></li>
                    <li><strong>Go to Dashboard → Domains</strong> — Enter your domain and click "Add Domain"</li>
                    <li><strong>DNS verification</strong> — We verify the DNS points to our server automatically</li>
                    <li><strong>SSL certificate</strong> — Let's Encrypt certificate is provisioned automatically (may take 1-2 minutes)</li>
                    <li><strong>Attach to a token</strong> — Assign the domain to one of your tunnel tokens</li>
                    <li><strong>Start your tunnel</strong> — Run the SSH command with the token that has the custom domain</li>
                  </ol>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Subdomains under your root domain</h2></div>
                <div className="card-body">
                  <p>Once you own a root domain (e.g. <span className="code">myapp.com</span>), you can create unlimited subdomains (<span className="code">api.myapp.com</span>, <span className="code">staging.myapp.com</span>, etc.) at no extra cost.</p>
                  <p className="dim" style={{ fontSize: '.8rem' }}>Subdomains don't count against your seat limit — only root domains do.</p>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h2>Plan limits</h2></div>
                <div className="card-body">
                  <table style={{ width: '100%', fontSize: '.85rem' }}>
                    <thead><tr><th>Plan</th><th>Root domains</th><th>Subdomains</th></tr></thead>
                    <tbody>
                      <tr><td>Free</td><td>1</td><td>Unlimited (under owned root)</td></tr>
                      <tr><td>Pro</td><td>= seats purchased</td><td>Unlimited</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ─── API KEYS ─── */}
          {activeSection === 'api-keys' && (
            <section>
              <h1>🔑 API Keys</h1>
              <p className="dim" style={{ fontSize: '.9rem', marginBottom: '1.5rem' }}>Manage tunnels and tokens programmatically from CI pipelines, scripts, or the Python SDK.</p>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Creating an API key</h2></div>
                <div className="card-body">
                  <ol style={{ paddingLeft: '1.2rem', fontSize: '.85rem', lineHeight: 1.8 }}>
                    <li>Go to <strong>Dashboard → API Keys</strong></li>
                    <li>Click <strong>"+ Create API Key"</strong></li>
                    <li>Give it a name (e.g. "CI pipeline") and choose an expiry</li>
                    <li>Copy the key immediately — it's shown <strong>only once</strong></li>
                  </ol>
                  <p className="dim" style={{ fontSize: '.8rem' }}>Keys start with <span className="code">pk_</span>. Only the SHA-256 hash is stored — the raw key is never retrievable again.</p>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Using the API key</h2></div>
                <div className="card-body">
                  <p>Send the key as a header:</p>
                  <div className="cmd-box cmd-box-relative">
                    <pre>curl -H "X-Api-Key: pk_YOUR_KEY" https://iraglobaltech.com/api/v1/manage/tunnels</pre>
                    <button className="btn btn-sm copy-btn" onClick={() => copy('curl -H "X-Api-Key: pk_YOUR_KEY" https://iraglobaltech.com/api/v1/manage/tunnels', 'ak1')}>{copied === 'ak1' ? '✅' : '📋'}</button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h2>Available endpoints</h2></div>
                <div className="card-body">
                  <table style={{ width: '100%', fontSize: '.82rem' }}>
                    <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
                    <tbody>
                      <tr><td><span className="badge badge-green">GET</span></td><td><span className="code">/manage/tunnels</span></td><td>List live + historical tunnels</td></tr>
                      <tr><td><span className="badge badge-blue">POST</span></td><td><span className="code">/manage/tokens</span></td><td>Create a new token</td></tr>
                      <tr><td><span className="badge badge-green">GET</span></td><td><span className="code">/manage/tokens</span></td><td>List your tokens</td></tr>
                      <tr><td><span className="badge badge-red">DELETE</span></td><td><span className="code">/manage/tokens/{`{id}`}</span></td><td>Delete a token</td></tr>
                      <tr><td><span className="badge badge-blue">POST</span></td><td><span className="code">/manage/tunnels/{`{sub}`}/stop</span></td><td>Stop a live tunnel</td></tr>
                      <tr><td><span className="badge badge-green">GET</span></td><td><span className="code">/manage/devices</span></td><td>List remote devices</td></tr>
                    </tbody>
                  </table>
                  <p className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>Full API reference: <a href="/docs" style={{ color: 'var(--brand)' }}>/docs</a> (Swagger UI)</p>
                </div>
              </div>
            </section>
          )}

          {/* ─── PYTHON SDK ─── */}
          {activeSection === 'sdk' && (
            <section>
              <h1>🐍 Python SDK</h1>
              <p className="dim" style={{ fontSize: '.9rem', marginBottom: '1.5rem' }}>Manage tunnels from Python with the built-in SDK. No pip install needed — just copy the file.</p>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Quick start</h2></div>
                <div className="card-body">
                  <div className="cmd-box cmd-box-relative">
                    <pre>{`from sdk.iragt_sdk import TunnelClient

client = TunnelClient("https://iraglobaltech.com", api_key="pk_YOUR_KEY")

# List your tokens
print(client.tokens())

# Create a new token with a fixed subdomain
t = client.create_token(name="ci-run", fixed_subdomain="ci-run")

# List live tunnels
print(client.tunnels())

# Stop a tunnel
client.stop_tunnel("ci-run")`}</pre>
                    <button className="btn btn-sm copy-btn" onClick={() => copy(`from sdk.iragt_sdk import TunnelClient\n\nclient = TunnelClient("https://iraglobaltech.com", api_key="pk_YOUR_KEY")\nprint(client.tokens())\nt = client.create_token(name="ci-run", fixed_subdomain="ci-run")\nprint(client.tunnels())\nclient.stop_tunnel("ci-run")`, 'sdk1')}>{copied === 'sdk1' ? '✅' : '📋'}</button>
                  </div>
                  <p className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>The SDK uses only <span className="code">urllib</span> — no external dependencies. Copy <span className="code">sdk/iragt_sdk.py</span> into your project.</p>
                </div>
              </div>
            </section>
          )}

          {/* ─── SECURITY ─── */}
          {activeSection === 'security' && (
            <section>
              <h1>🔒 Security Features</h1>
              <p className="dim" style={{ fontSize: '.9rem', marginBottom: '1.5rem' }}>Protect your tunnels with per-token security settings.</p>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Per-token security options</h2></div>
                <div className="card-body">
                  <table style={{ width: '100%', fontSize: '.85rem' }}>
                    <thead><tr><th>Feature</th><th>Description</th></tr></thead>
                    <tbody>
                      <tr><td><strong>HTTP Basic Auth</strong></td><td>Require username/password to access the tunnel</td></tr>
                      <tr><td><strong>IP Whitelist</strong></td><td>Only allow specific IPs/CIDR ranges</td></tr>
                      <tr><td><strong>Bearer Key</strong></td><td>Require <span className="code">X-Api-Key</span> header to access</td></tr>
                      <tr><td><strong>HTTPS-only</strong></td><td>Reject all HTTP requests (enforce TLS)</td></tr>
                    </tbody>
                  </table>
                  <p className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>Configure from <strong>Dashboard → Manage Tokens → Edit</strong>.</p>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h2>2FA (Two-Factor Authentication)</h2></div>
                <div className="card-body">
                  <p>Enable email-based OTP for your account at <strong>Dashboard → Security</strong>. A 6-digit code is emailed on every login.</p>
                </div>
              </div>
            </section>
          )}

          {/* ─── PLANS ─── */}
          {activeSection === 'plans' && (
            <section>
              <h1>💳 Plans</h1>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><h2>Free</h2></div>
                <div className="card-body">
                  <ul style={{ fontSize: '.85rem', paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                    <li>1 root custom domain</li>
                    <li>Unlimited subdomains under owned root</li>
                    <li>5 API keys</li>
                    <li>Unlimited tunnels</li>
                    <li>Community support</li>
                  </ul>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><h2>Pro</h2></div>
                <div className="card-body">
                  <ul style={{ fontSize: '.85rem', paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                    <li>Root domains = seats purchased (buy more anytime)</li>
                    <li>Unlimited subdomains</li>
                    <li>10 API keys</li>
                    <li>Teams + seat sharing</li>
                    <li>Priority support</li>
                    <li>TCP tunneling</li>
                  </ul>
                  <p className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>Upgrade from <strong>Dashboard → Plan</strong>.</p>
                </div>
              </div>
            </section>
          )}

          {/* ─── FAQ ─── */}
          {activeSection === 'faq' && (
            <section>
              <h1>❓ FAQ</h1>
              {[
                { q: 'Do I need to install anything?', a: 'No. The tunnel uses SSH reverse port forwarding, which is built into macOS, Linux, and Windows 10+. Just run the command from the Quickstart.' },
                { q: 'Do I need SSH keys?', a: 'No. Authentication uses your tunnel token as the SSH username. No key generation or copying required.' },
                { q: 'What happens if the server restarts?', a: 'Your tunnels will disconnect briefly, but the auto-reconnect command (in the SSH Command section) will re-establish them automatically. The server reconciles stale tunnels on startup.' },
                { q: 'Can I use a fixed subdomain?', a: 'Yes. When creating a token, specify a fixed_subdomain (e.g. "myapp") and you\'ll always get myapp.iraglobaltech.com — it persists across reconnects.' },
                { q: 'Is my API key stored securely?', a: 'Yes. Only the SHA-256 hash of your key is stored. The raw key is shown once at creation and never retrievable again. Failed auth attempts are rate-limited.' },
                { q: 'Can I protect my tunnel with a password?', a: 'Yes. Go to Manage Tokens → Edit and enable HTTP Basic Auth, IP Whitelist, Bearer Key, or HTTPS-only mode.' },
                { q: 'What ports can I tunnel?', a: 'Any local port. Common examples: 8080 (web dev), 3000 (React), 8000 (Django/Laravel), 5173 (Vite), 4200 (Angular).' },
              ].map((f, i) => (
                <div key={i} className="card" style={{ marginBottom: '.8rem' }}>
                  <div className="card-header"><h2 style={{ fontSize: '.95rem' }}>{f.q}</h2></div>
                  <div className="card-body"><p style={{ fontSize: '.85rem' }}>{f.a}</p></div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}