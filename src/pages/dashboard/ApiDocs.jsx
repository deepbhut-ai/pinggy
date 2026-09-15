import { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { SearchBar } from '../../components/TableControls';

// API Docs — endpoint reference (static content, mirrors legacy loadApiDocs)
export default function ApiDocs() {
  const base = window.location.origin;
  const [search, setSearch] = useState('');
  const endpoints = [
    ['GET', '/manage/tunnels', 'Your live tunnels + recent history'],
    ['POST', '/manage/tunnels/{sub}/stop', 'Stop one of your live tunnels'],
    ['GET', '/manage/devices', 'Your connected remote devices'],
    ['GET', '/tokens', 'List your tunnel tokens'],
    ['POST', '/tokens', 'Create a new tunnel token'],
    ['DELETE', '/tokens/{id}', 'Delete a tunnel token'],
    ['GET', '/apikeys', 'List your API keys'],
    ['POST', '/apikeys', 'Create an API key'],
    ['GET', '/invoices', 'Your invoices'],
    ['GET', '/plans', 'Available plans'],
    ['GET', '/teams', 'Your teams'],
    ['POST', '/tickets', 'Open a support ticket'],
  ];

  const filtered = useMemo(() => {
    if (!search.trim()) return endpoints;
    const q = search.trim().toLowerCase();
    return endpoints.filter(([method, path, desc]) =>
      method.toLowerCase().includes(q) || path.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
    );
  }, [search, endpoints]);

  return (
    <>
      <div className="page-title">API Documentation</div>
      <div className="page-subtitle">Manage IRAGT from scripts, CI pipelines, and the Python SDK</div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>Authentication</h2></div>
        <div className="card-body">
          <p className="dim">Create a key under <strong>API Keys</strong>, then send it on every request:</p>
          <div className="cmd-box"><pre>X-Api-Key: pk_your_key_here</pre></div>
          <p className="dim">All endpoints live under <span className="code">{base}/api/v1</span>. JWT Bearer tokens (your dashboard login) also work.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
          <h2>Endpoints</h2>
          <SearchBar value={search} onChange={setSearch} placeholder="Search method, path, description…" style={{ maxWidth: 320 }} />
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {filtered.length === 0 ? (
            <p className="empty">No endpoints match your search.</p>
          ) : (
          <table>
            <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
            <tbody>
              {filtered.map(([method, path, desc]) => (
                <tr key={method + path}>
                  <td><span className={`badge ${method === 'GET' ? 'badge-green' : ''}`}>{method}</span></td>
                  <td className="code">{path}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* ─── WebSocket ─── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>WebSocket Tunnels</h2></div>
        <div className="card-body">
          <p className="dim">IRAGT supports WebSocket connections through your tunnels. The proxy bridges the client's WebSocket to your local service via the SSH reverse tunnel — data frames flow bidirectionally.</p>

          <h3 style={{ marginTop: '1.2rem', fontSize: '.95rem' }}>How It Works</h3>
          <div className="cmd-box" style={{ marginTop: '.5rem' }}>
            <pre>{`Client (browser / Twilio)
  → nginx :443 (TLS, HTTP/1.1)
    → IRAGT FastAPI :8000 (tunnel_websocket)
      → ws://127.0.0.1:<remote_port> (SSH tunnel)
        → Your local service (Daphne, Node.js, etc.)`}</pre>
          </div>

          <h3 style={{ marginTop: '1.2rem', fontSize: '.95rem' }}>Connecting</h3>
          <p className="dim" style={{ marginTop: '.3rem' }}>Use <code className="code">wss://</code> for secure WebSocket. The path after the domain is forwarded to your local service:</p>
          <div className="cmd-box" style={{ marginTop: '.5rem' }}>
            <pre>{`# JavaScript (browser)
const ws = new WebSocket('wss://your-sub.iraglobaltech.com/ws/chat/');
ws.onopen = () => ws.send(JSON.stringify({type: 'setup'}));
ws.onmessage = (e) => console.log('Received:', e.data);`}</pre>
          </div>
          <div className="cmd-box" style={{ marginTop: '.5rem' }}>
            <pre>{`# Python (websockets library)
import asyncio, websockets

async def connect():
    async with websockets.connect("wss://your-sub.iraglobaltech.com/ws/chat/") as ws:
        await ws.send('{"type":"setup"}')
        print(await ws.recv())

asyncio.run(connect())`}</pre>
          </div>

          <h3 style={{ marginTop: '1.2rem', fontSize: '.95rem' }}>With a Custom Domain</h3>
          <p className="dim" style={{ marginTop: '.3rem' }}>If your token has a custom domain, use that instead of the subdomain URL:</p>
          <div className="cmd-box" style={{ marginTop: '.5rem' }}>
            <pre>wss://code.example.com/ws/audio/</pre>
          </div>

          <h3 style={{ marginTop: '1.2rem', fontSize: '.95rem' }}>Twilio ConversationRelay (AI Voice)</h3>
          <p className="dim" style={{ marginTop: '.3rem' }}>Set your TwiML <code className="code">&lt;ConversationRelay&gt;</code> URL to your IRAGT WebSocket endpoint:</p>
          <div className="cmd-box" style={{ marginTop: '.5rem' }}>
            <pre>{`<Response>
  <Connect>
    <ConversationRelay url="wss://code.example.com/ws/audio/"/>
  </Connect>
</Response>`}</pre>
          </div>

          <h3 style={{ marginTop: '1.2rem', fontSize: '.95rem' }}>Important Notes</h3>
          <ul className="dim" style={{ fontSize: '.85rem', paddingLeft: '1.2rem', marginTop: '.3rem' }}>
            <li><strong>HTTP/1.1 required:</strong> WebSocket uses the <code className="code">Upgrade</code> header (RFC 6455), which only works with HTTP/1.1. IRAGT's nginx is configured without HTTP/2 to ensure compatibility.</li>
            <li><strong>Long timeout:</strong> The <code className="code">/ws/</code> path has a 3600s (1 hour) proxy timeout for sustained connections.</li>
            <li><strong>SSL cert:</strong> For custom domains, ensure a valid Let's Encrypt cert is issued (Dashboard → Domains → Verify).</li>
            <li><strong>No buffering:</strong> WebSocket frames are streamed directly — no proxy buffering.</li>
            <li><strong>After restart:</strong> Tunnels take 20-30 seconds to reconnect after an IRAGT service restart. WS connections during this window will get 403.</li>
          </ul>

          <p className="dim" style={{ marginTop: '1rem', fontSize: '.8rem' }}>
            📖 Full guide: <a href="/guide#websocket" style={{ color: 'var(--brand)' }}>WebSocket Tunnel Guide</a>
          </p>
        </div>
      </div>
    </>
  );
}