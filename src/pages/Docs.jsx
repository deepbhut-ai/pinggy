import { useState } from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';

export default function Docs() {
  const [activeSection, setActiveSection] = useState('quickstart');
  const [copiedCode, setCopiedCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const copyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const sections = [
    { id: 'quickstart', title: '🚀 Quick Start', tag: 'Basics' },
    { id: 'multiport', title: '🌐 Multi-Port Flow', tag: 'Core' },
    { id: 'cli', title: '💻 CLI & Package', tag: 'Tools' },
    { id: 'domains', title: '🏷️ Custom Domains', tag: 'Network' },
    { id: 'security', title: '🔒 Security & Auth', tag: 'Security' },
    { id: 'websockets', title: '⚡ WebSockets', tag: 'Realtime' },
    { id: 'api', title: '📡 REST API', tag: 'Developers' },
  ];

  const filteredSections = sections.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <PublicLayout>
         <style>{`
      @media (max-width: 790px) {
        .docs-container {
          display: block !important;
          padding: 1.25rem 1rem !important;
        }
        .docs-sidebar {
          width: 100% !important;
          position: static !important;
          margin-bottom: 1.5rem;
        }
        .docs-content {
          width: 100% !important;
        }
          .setpre{
           overflow-x: scroll;
          }
      }
    `}</style>
      <div className="docs-container" style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', gap: '2rem', minHeight: 'calc(100vh - 180px)' }}>
        
        {/* ─── SIDEBAR NAVIGATION ─── */}
        <aside className="docs-sidebar" style={{ width: 260, flexShrink: 0, position: 'sticky', top: '80px', height: 'fit-content' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', boxShadow: '0 4px 20px rgba(74,85,162,0.06)' }}>
            <div style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Search docs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '.5rem .75rem', fontSize: '.85rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface-1)' }}
              />
            </div>

            <div style={{ fontSize: '.75rem', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '.05em', marginBottom: '.5rem' }}>
              Documentation
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              {filteredSections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => {
                    setActiveSection(sec.id);
                    document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '.55rem .75rem',
                    borderRadius: 'var(--radius)',
                    border: 'none',
                    background: activeSection === sec.id ? 'var(--brand-light)' : 'transparent',
                    color: activeSection === sec.id ? 'var(--brand)' : 'var(--text)',
                    fontWeight: activeSection === sec.id ? 700 : 500,
                    fontSize: '.85rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: '.15s',
                  }}
                >
                  <span>{sec.title}</span>
                  <span style={{ fontSize: '.7rem', opacity: .6, background: 'var(--surface-2)', padding: '.1rem .4rem', borderRadius: '999px' }}>{sec.tag}</span>
                </button>
              ))}
            </nav>

            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              <Link to="/dashboard" className="pbtn" style={{ width: '100%', fontSize: '.85rem', padding: '.45rem' }}>
                Open Dashboard →
              </Link>
            </div>
          </div>
        </aside>

        {/* ─── MAIN DOCUMENTATION CONTENT ─── */}
        <main className="docs-content" style={{ flex: 1, minWidth: 0 }}>
          
          {/* Header */}
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.25rem .75rem', background: 'var(--brand-light)', color: 'var(--brand)', borderRadius: '999px', fontSize: '.78rem', fontWeight: 700, marginBottom: '.75rem' }}>
              <img src="/logo.png" alt="IRAGT" style={{ height: '16px', width: 'auto' }} /> IRAGT Developer Docs
            </div>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: '.5rem', color: 'var(--text)' }}>
              IRAGT Documentation & Guides
            </h1>
            <p style={{ color: 'var(--text-dim)', fontSize: '1.05rem', lineHeight: 1.6 }}>
              Instant, encrypted public URLs for your local development servers, APIs, WebSockets, and multi-service stacks without port forwarding.
            </p>
          </div>

          {/* 1. Quick Start */}
          <section id="quickstart" style={{ marginBottom: '3rem', scrollMarginTop: '100px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', boxShadow: '0 4px 20px rgba(74,85,162,0.06)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                🚀 Quick Start (Zero-Flag Tunneling)
              </h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1.25rem', fontSize: '.95rem' }}>
                You can start tunneling your local services in seconds. Connect directly using our global CLI, zero-install <code>npx</code> runner, or standard <code>cURL</code> / <code>ssh</code>.
              </p>

              {/* Option A: npx */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                  <strong style={{ fontSize: '.9rem' }}>Method 1: Instant Run with <code>npx</code> (No install required)</strong>
                  <button
                    className="pbtn pbtn-ghost"
                    style={{ padding: '.2rem .6rem', fontSize: '.75rem' }}
                    onClick={() => copyCode('npx iragt connect YOUR_TOKEN', 'npx')}
                  >
                    {copiedCode === 'npx' ? '✅ Copied' : '📋 Copy'}
                  </button>
                </div>
                <div style={{ background: '#0d1117', color: '#c9d1d9', padding: '1rem', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '.85rem', overflowX: 'auto' }}>
                  <code>npx iragt connect YOUR_TOKEN</code>
                </div>
              </div>

              {/* Option B: npm global */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                  <strong style={{ fontSize: '.9rem' }}>Method 2: Global NPM Install</strong>
                  <button
                    className="pbtn pbtn-ghost"
                    style={{ padding: '.2rem .6rem', fontSize: '.75rem' }}
                    onClick={() => copyCode('npm install -g iragt\niragt connect YOUR_TOKEN', 'npm')}
                  >
                    {copiedCode === 'npm' ? '✅ Copied' : '📋 Copy'}
                  </button>
                </div>
                <div style={{ background: '#0d1117', color: '#c9d1d9', padding: '1rem', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '.85rem', overflowX: 'auto' }}>
                  <code>npm install -g iragt<br />iragt connect YOUR_TOKEN</code>
                </div>
              </div>

              {/* Option C: curl */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                  <strong style={{ fontSize: '.9rem' }}>Method 3: Universal 1-Line cURL Runner (Mac / Linux)</strong>
                  <button
                    className="pbtn pbtn-ghost"
                    style={{ padding: '.2rem .6rem', fontSize: '.75rem' }}
                    onClick={() => copyCode('curl -sSL https://iraglobaltech.com/run | bash -s YOUR_TOKEN', 'curl')}
                  >
                    {copiedCode === 'curl' ? '✅ Copied' : '📋 Copy'}
                  </button>
                </div>
                <div style={{ background: '#0d1117', color: '#c9d1d9', padding: '1rem', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '.85rem', overflowX: 'auto' }}>
                  <code>curl -sSL https://iraglobaltech.com/run | bash -s YOUR_TOKEN</code>
                </div>
              </div>

              {/* Option D: Raw SSH */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                  <strong style={{ fontSize: '.9rem' }}>Method 4: Standard OpenSSH (Pure Terminal)</strong>
                  <button
                    className="pbtn pbtn-ghost"
                    style={{ padding: '.2rem .6rem', fontSize: '.75rem' }}
                    onClick={() => copyCode('ssh -p 2222 -R0:127.0.0.1:8080 -o StrictHostKeyChecking=no YOUR_TOKEN@ssh.iraglobaltech.com', 'ssh')}
                  >
                    {copiedCode === 'ssh' ? '✅ Copied' : '📋 Copy'}
                  </button>
                </div>
                <div style={{ background: '#0d1117', color: '#c9d1d9', padding: '1rem', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '.85rem', overflowX: 'auto' }}>
                  <code>ssh -p 2222 -R0:127.0.0.1:8080 -o StrictHostKeyChecking=no YOUR_TOKEN@ssh.iraglobaltech.com</code>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Multi-Port Flow */}
          <section id="multiport" style={{ marginBottom: '3rem', scrollMarginTop: '100px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', boxShadow: '0 4px 20px rgba(74,85,162,0.06)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                🌐 Multi-Port Tunneling Architecture
              </h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1rem', fontSize: '.95rem', lineHeight: 1.6 }}>
                IRAGT allows forwarding multiple local ports (e.g., React on <code>3000</code>, FastAPI on <code>8000</code>, Docs on <code>5173</code>) simultaneously over <strong>one single tunnel connection</strong>.
              </p>

              <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '.95rem', fontWeight: 700, marginBottom: '.5rem' }}>How Website-Managed Multi-Port Works:</h4>
                <ol style={{ paddingLeft: '1.2rem', color: 'var(--text-dim)', fontSize: '.9rem', lineHeight: 1.8 }}>
                  <li>In your <strong>Configure Tunnel</strong> dashboard, you assign local ports to your custom domains (e.g. <code>app.domain.com → 3000</code>, <code>api.domain.com → 8000</code>).</li>
                  <li>Click <strong>Save Settings</strong> to store your mappings in the cloud database.</li>
                  <li>Run <code>iragt connect YOUR_TOKEN</code>. The client pulls your port map and forwards each local service automatically.</li>
                  <li>Incoming web traffic is routed dynamically to the exact matching local service port!</li>
                </ol>
              </div>

              <div className='setpre' style={{ background: '#0d1117', color: '#c9d1d9', padding: '1.25rem', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '.82rem', lineHeight: 1.6 }}>
                <pre style={{ margin: 0 }}>{`  ╔═════════════════════════════════════════════════════════════╗
  ║                     IRAGT TUNNEL ACTIVE                     ║
  ╠═════════════════════════════════════════════════════════════╣
  ║  https://app.yourdomain.com   --> localhost:3000            ║
  ║  https://api.yourdomain.com   --> localhost:8000            ║
  ║  https://docs.yourdomain.com  --> localhost:5173            ║
  ╚═════════════════════════════════════════════════════════════╝`}</pre>
              </div>
            </div>
          </section>

          {/* 3. CLI & Package Reference */}
          <section id="cli" style={{ marginBottom: '3rem', scrollMarginTop: '100px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', boxShadow: '0 4px 20px rgba(74,85,162,0.06)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                💻 CLI Commands & Options
              </h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1.25rem', fontSize: '.95rem' }}>
                The official <code>iragt</code> CLI is distributed via NPM and PyPI.
              </p>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem', marginBottom: '1.25rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '.6rem' }}>Command</th>
                    <th style={{ padding: '.6rem' }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '.6rem', fontFamily: 'var(--font-mono)', color: 'var(--brand)', fontWeight: 600 }}>iragt connect &lt;TOKEN&gt;</td>
                    <td style={{ padding: '.6rem', color: 'var(--text-dim)' }}>Connect to your saved tunnel configuration with all local ports auto-mapped.</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '.6rem', fontFamily: 'var(--font-mono)', color: 'var(--brand)', fontWeight: 600 }}>iragt &lt;TOKEN&gt;</td>
                    <td style={{ padding: '.6rem', color: 'var(--text-dim)' }}>Shorthand connection syntax.</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '.6rem', fontFamily: 'var(--font-mono)', color: 'var(--brand)', fontWeight: 600 }}>npx iragt connect &lt;TOKEN&gt;</td>
                    <td style={{ padding: '.6rem', color: 'var(--text-dim)' }}>Execute directly without prior package installation.</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                <strong>📦 NPM Registry:</strong> <a href="https://www.npmjs.com/package/iragt" target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', fontWeight: 600 }}>npmjs.com/package/iragt</a>
              </div>
            </div>
          </section>

          {/* 4. Custom Domains & DNS */}
          <section id="domains" style={{ marginBottom: '3rem', scrollMarginTop: '100px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', boxShadow: '0 4px 20px rgba(74,85,162,0.06)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                🏷️ Custom Domains & DNS Setup
              </h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1.25rem', fontSize: '.95rem' }}>
                Attach your own custom domain or subdomains (e.g., <code>api.yourcompany.com</code>) to your IRAGT account with free automatic SSL.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                  <h4 style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: '.3rem' }}>Apex / Root Domain (example.com)</h4>
                  <p style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>Add a DNS <strong>A Record</strong>:</p>
                  <div style={{ background: '#0d1117', color: '#c9d1d9', padding: '.6rem', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '.8rem', marginTop: '.4rem' }}>
                    Type: A<br />Name: @<br />Value: 13.140.131.204
                  </div>
                </div>

                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                  <h4 style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: '.3rem' }}>Subdomain (api.example.com)</h4>
                  <p style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>Add a DNS <strong>CNAME Record</strong>:</p>
                  <div style={{ background: '#0d1117', color: '#c9d1d9', padding: '.6rem', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '.8rem', marginTop: '.4rem' }}>
                    Type: CNAME<br />Name: api<br />Value: iraglobaltech.com
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Security & Authentication */}
          <section id="security" style={{ marginBottom: '3rem', scrollMarginTop: '100px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', boxShadow: '0 4px 20px rgba(74,85,162,0.06)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                🔒 Security & Access Control
              </h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1.25rem', fontSize: '.95rem' }}>
                Protect your exposed local services directly from the edge without changing application code.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                  <h4 style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: '.3rem' }}>🛡️ HTTP Basic Auth</h4>
                  <p style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>Gate your tunnel with username & password prompts enforced by IRAGT edge proxies.</p>
                </div>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                  <h4 style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: '.3rem' }}>🔑 Bearer API Keys</h4>
                  <p style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>Require valid <code>Authorization: Bearer &lt;key&gt;</code> headers on all incoming requests.</p>
                </div>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                  <h4 style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: '.3rem' }}>🌍 IP Whitelisting</h4>
                  <p style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>Restrict incoming tunnel access to specific IP ranges or CIDR blocks.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 6. WebSockets */}
          <section id="websockets" style={{ marginBottom: '3rem', scrollMarginTop: '100px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', boxShadow: '0 4px 20px rgba(74,85,162,0.06)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                ⚡ WebSockets & Real-Time Streaming
              </h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1.25rem', fontSize: '.95rem' }}>
                IRAGT features built-in WebSocket pass-through support with zero configuration required. Ideal for Twilio ConversationRelay, LiveKit, Socket.io, and live AI voice streaming.
              </p>

              <div style={{ background: '#0d1117', color: '#c9d1d9', padding: '1rem', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '.82rem', overflowX: 'auto' }}>
                <code>
                  wss://app.yourdomain.com/ws  ──&gt;  ws://localhost:3000/ws
                </code>
              </div>
            </div>
          </section>

          {/* 7. REST API Reference */}
          <section id="api" style={{ marginBottom: '3rem', scrollMarginTop: '100px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', boxShadow: '0 4px 20px rgba(74,85,162,0.06)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                📡 REST API Endpoints
              </h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1.25rem', fontSize: '.95rem' }}>
                Programmatically manage tokens, retrieve active tunnels, and fetch multi-port configurations.
              </p>

              <div  style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                <div className='setpre' style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.75rem 1rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <span style={{ background: 'var(--green)', color: '#fff', fontSize: '.72rem', fontWeight: 700, padding: '.15rem .45rem', borderRadius: '4px' }}>GET</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600 }}>/api/v1/configs/cli/&#123;token&#125;</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '.8rem',}}>Fetch CLI tunnel & port mappings</span>
                </div>

                <div className='setpre' style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.75rem 1rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <span style={{ background: 'var(--brand)', color: '#fff', fontSize: '.72rem', fontWeight: 700, padding: '.15rem .45rem', borderRadius: '4px' }}>PUT</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600 }}>/api/v1/configs/multiport</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '.8rem' }}>Save multiport domain/port preferences</span>
                </div>

                <div className='setpre' style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.75rem 1rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <span style={{ background: 'var(--green)', color: '#fff', fontSize: '.72rem', fontWeight: 700, padding: '.15rem .45rem', borderRadius: '4px' }}>GET</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600 }}>/api/v1/tunnels</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '.8rem' }}>List live active tunnels</span>
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </PublicLayout>
  );
}
