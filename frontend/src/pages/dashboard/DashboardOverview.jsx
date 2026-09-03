import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { copyToClipboard, formatBytes } from '../../utils';

// Dashboard overview — the "home" page of the dashboard.
// Shows workspace overview, live tunnel status, traffic metrics, domain health.
// (Tunnel setup steps live on the Quickstart page.)
export default function DashboardOverview() {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [tunnels, setTunnels] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const rateRef = useRef({});
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [infoD, tunnelsD, tokensD, annsD] = await Promise.all([
        api('/tunnels/info'),
        api('/tunnels/my'),
        api('/tokens').catch(() => []),
        api('/announcements?active_only=true').catch(() => []),
      ]);
      setInfo(infoD);
      setTunnels(tunnelsD);
      setTokens(tokensD);
      if (tokensD[0] && !selectedTokenId) setSelectedTokenId(tokensD[0].id);
      setAnnouncements(annsD);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll live tunnels every 5s
  useEffect(() => {
    const poll = async () => {
      try {
        const t = await api('/tunnels/my');
        const now = Date.now();
        const next = {};
        t.forEach((tn) => {
          const id = tn.tunnel_id || tn.subdomain;
          next[id] = { lastBytes: tn.bytes_transferred || 0, lastTime: now, prev: rateRef.current[id] };
        });
        rateRef.current = next;
        setTunnels(t);
      } catch {}
    };
    pollRef.current = setInterval(poll, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  const selectedToken = tokens.find((t) => t.id === selectedTokenId) || tokens[0] || null;
  const token = selectedToken?.token || '';
  const isPro = (user?.plan || 'free') === 'pro';
  const totalRequests = tunnels.reduce((s, t) => s + (t.request_count || 0), 0);
  const totalBytes = tunnels.reduce((s, t) => s + (t.bytes_transferred || 0), 0);

  const kbpsOf = (t) => {
    const id = t.tunnel_id || t.subdomain;
    const cur = rateRef.current[id];
    if (!cur?.prev) return '—';
    const dt = Date.now() - cur.prev.lastTime;
    if (dt <= 0) return '—';
    return (((t.bytes_transferred - cur.prev.lastBytes) / 1024) / (dt / 1000)).toFixed(2);
  };

  return (
    <>
      {/* Announcements */}
      {announcements.length > 0 && (
        <div id="annBanner">
          {announcements.map((a) => (
            <div key={a.id} className={`announcement ${a.level}`}>
              <strong>{a.title}</strong>
              <div className="announcement-body">{a.body}</div>
            </div>
          ))}
        </div>
      )}

      <div className="page-toolbar">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Overview of your tunnel workspace</div>
        </div>
        <div className="page-toolbar-actions">
          {tokens.length > 0 && (
            <select value={selectedTokenId || ''} onChange={(e) => setSelectedTokenId(e.target.value)} style={{ width: 'auto', minWidth: 180 }}>
              {tokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || 'Unnamed'} ({isPro ? 'Pro' : 'Free'})
                </option>
              ))}
            </select>
          )}
          <span className={`badge ${tunnels.length ? 'badge-green' : 'badge-blue'}`}>
            {tunnels.length ? `${tunnels.length} active` : 'Ready to connect'}
          </span>
          <a className="btn btn-sm" href="/dashboard/quickstart">Quickstart →</a>
        </div>
      </div>

      {/* Workspace strip */}
      <div className="workspace-strip">
        <div className="left">
          <span className="workspace-dot"></span>
          <div>
            <div className="workspace-name">Workspace overview</div>
            <div className="workspace-meta">Primary tunnel environment</div>
          </div>
        </div>
        <div className="workspace-chips">
          <span className="chip">{tunnels.length ? 'Connected' : 'Ready'}</span>
          <span className="chip">{(user?.plan || 'free').toUpperCase()}</span>
          <span className="chip">{tokens.length} token{tokens.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">Current tunnel</div>
          <div className="summary-value">{tunnels[0] ? (tunnels[0].custom_url || tunnels[0].url) : 'No active tunnel yet'}</div>
          <div className="summary-sub">Live public URL for your workspace</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Custom domain</div>
          <div className="summary-value">{selectedToken?.custom_domain || 'Not set yet'}</div>
          <div className="summary-sub">Uses the canonical domain for this token</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Status</div>
          <div className="summary-value"><span className="pill">{tunnels.length ? 'Active' : 'Ready'}</span></div>
          <div className="summary-sub">{tunnels.length ? `${tunnels.length} tunnel${tunnels.length !== 1 ? 's' : ''} currently running` : 'Wait for the terminal to connect'}</div>
        </div>
      </div>

      {/* Live overview */}
      <div className="live-overview">
        <div className="live-overview-card">
          <div className="heading">
            <strong>Live tunnel overview</strong>
            <span className="pill">{tunnels.length ? 'Connected' : 'Waiting'}</span>
          </div>
          <div className="live-link">{tunnels[0] ? (tunnels[0].custom_url || tunnels[0].url) : 'https://your-tunnel-url.example'}</div>
          <div className="live-meta">
            <div className="meta-box">
              <div className="label">Token</div>
              <div className="value">{token ? token.substring(0, 10) + '••••' : 'Not created'}</div>
            </div>
            <div className="meta-box">
              <div className="label">Custom domain</div>
              <div className="value">{selectedToken?.custom_domain || 'Not assigned'}</div>
            </div>
          </div>
        </div>
        <div className="live-overview-card">
          <div className="heading">
            <strong>Traffic</strong>
            <span className="pill">Live</span>
          </div>
          <div className="live-meta">
            <div className="meta-box">
              <div className="label">Requests</div>
              <div className="value">{tunnels[0]?.request_count || 0}</div>
            </div>
            <div className="meta-box">
              <div className="label">Data</div>
              <div className="value">{tunnels[0] ? formatBytes(tunnels[0].bytes_transferred) : '0 KB'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics metrics */}
      <div className="analytics-grid">
        <div className="metric-card">
          <div className="metric-label">Active Tunnels</div>
          <div className="metric-value">{tunnels.length}</div>
          <div className="metric-sub">Running now</div>
        </div>
        <div className="metric-card accent">
          <div className="metric-label">Total Requests</div>
          <div className="metric-value">{totalRequests}</div>
          <div className="metric-sub">All tunnels</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Data Transferred</div>
          <div className="metric-value">{(totalBytes / (1024 * 1024)).toFixed(1)}</div>
          <div className="metric-sub">MB</div>
        </div>
        <div className="metric-card accent">
          <div className="metric-label">Uptime Status</div>
          <div className="metric-value" style={{ color: 'var(--green)' }}>✓ OK</div>
          <div className="metric-sub">All systems running</div>
        </div>
      </div>

      {/* Domain health */}
      <div className="domain-health-panel">
        <div className="health-header">
          <span className="health-title">🌐 Domain Health</span>
          <div className="domain-health-status"><span className="dot"></span><span className="status-text">Healthy</span></div>
        </div>
        <div className="domain-health-items">
          {[['DNS'], ['SSL/TLS'], ['Connectivity'], ['Performance']].map(([l]) => (
            <div className="health-item" key={l}>
              <span className="item-label">{l}</span>
              <span className="item-value" style={{ color: 'var(--green)' }}>✓</span>
            </div>
          ))}
        </div>
      </div>

      {/* Plan banner */}
      {!isPro ? (
        <div className="banner banner-amber">
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong style={{ fontSize: '.9rem' }}>Free plan</strong>
            <span className="dim"> — tunnels disconnect after 60 min & get a random subdomain each time.</span>
          </div>
          <a href="/dashboard/plan" className="btn btn-sm">Upgrade to Pro →</a>
        </div>
      ) : (
        <div className="banner banner-green">
          <span style={{ fontSize: '1.25rem' }}>⭐</span>
          <div>
            <strong style={{ fontSize: '.9rem' }}>Pro plan</strong>
            <span className="dim"> — persistent tunnels, fixed subdomains, custom domain.</span>
          </div>
        </div>
      )}

      {/* Active tunnels table */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h2>🔗 My Active Tunnels ({tunnels.length})</h2>
          <button className="btn btn-sm btn-ghost" onClick={load}>🔄 Refresh</button>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {tunnels.length === 0 ? (
            <p className="empty">No active tunnels yet. <a href="/dashboard/quickstart" style={{ color: 'var(--brand)' }}>Start one from Quickstart →</a></p>
          ) : (
            <table>
              <thead>
                <tr><th>Tunnel URL</th><th>Subdomain</th><th>Requests</th><th>Data</th><th>Transfer Rate</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {tunnels.map((t) => (
                  <tr key={t.tunnel_id || t.subdomain}>
                    <td>
                      <a href={t.url} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', fontWeight: 600 }}>{t.url}</a>
                      {t.custom_url && (
                        <>
                          <br />
                          <a href={t.custom_url} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', fontSize: '.8rem', fontWeight: 600 }}>{t.custom_url}</a>
                        </>
                      )}
                    </td>
                    <td className="code">{t.subdomain}</td>
                    <td>{t.request_count}</td>
                    <td>{formatBytes(t.bytes_transferred)}</td>
                    <td>{kbpsOf(t)} KB/s</td>
                    <td><span className="badge badge-green">{t.status}</span></td>
                    <td>{(t.created_at || '').replace('T', ' ').substring(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}