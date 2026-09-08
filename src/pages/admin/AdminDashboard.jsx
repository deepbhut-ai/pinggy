import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { formatBytes } from '../../utils';

// Admin Dashboard — stats, insights, recent tunnels, system info.
// APIs: GET /users, GET /tunnels/history, GET /payments/admin/stats,
//       GET /tunnels/info, GET /analytics/overview?days=N

export default function AdminDashboard() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [tunnels, setTunnels] = useState([]);
  const [payStats, setPayStats] = useState(null);
  const [sysInfo, setSysInfo] = useState(null);
  const [insights, setInsights] = useState(null);
  const [insightsDays, setInsightsDays] = useState(30);

  const load = useCallback(async () => {
    try {
      const [u, t, ps, si] = await Promise.all([
        api('/users'),
        api('/tunnels/history?limit=500'),
        api('/payments/admin/stats').catch(() => null),
        api('/tunnels/info').catch(() => null),
      ]);
      setUsers(u); setTunnels(t); setPayStats(ps); setSysInfo(si);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  const loadInsights = useCallback(async (days) => {
    try {
      const d = await api(`/analytics/overview?days=${days}`);
      setInsights(d);
    } catch (e) { /* analytics optional */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadInsights(insightsDays); }, [insightsDays, loadInsights]);

  const activeNow = tunnels.filter((t) => t.status === 'connected').length;
  const totalRequests = tunnels.reduce((s, t) => s + (t.request_count || 0), 0);
  const totalData = tunnels.reduce((s, t) => s + (t.bytes_transferred || 0), 0);
  const revenueEntries = payStats?.revenue ? Object.entries(payStats.revenue) : [];
  const recent = tunnels.slice(-10).reverse();
  const sum = insights?.summary || {};

  return (
    <>
      <div className="page-title">Admin Dashboard</div>
      <div className="page-subtitle">Platform overview — users, tunnels, revenue</div>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card"><div className="label">Total Users</div><div className="value">{users.length}</div></div>
        <div className="stat-card"><div className="label">Active Tunnels</div><div className="value">{activeNow}</div></div>
        <div className="stat-card"><div className="label">Total Tunnels</div><div className="value">{tunnels.length}</div></div>
        <div className="stat-card"><div className="label">Total Requests</div><div className="value">{totalRequests.toLocaleString()}</div></div>
        <div className="stat-card"><div className="label">Data Transfer</div><div className="value">{formatBytes(totalData)}</div></div>
        {revenueEntries.map(([cur, amt]) => (
          <div className="stat-card" key={cur}><div className="label">Revenue ({cur})</div><div className="value">{Number(amt).toLocaleString()}</div></div>
        ))}
        <div className="stat-card"><div className="label">Total Payments</div><div className="value">{payStats?.total_payments ?? '—'}</div></div>
      </div>

      {/* Insights */}
      {insights && (
        <div className="card">
          <div className="card-header">
            <h2>📈 Insights</h2>
            <div style={{ display: 'flex', gap: '.4rem' }}>
              {[30, 60, 90].map((d) => (
                <button key={d} className={`btn btn-sm ${insightsDays === d ? '' : 'btn-ghost'}`} onClick={() => setInsightsDays(d)}>{d}d</button>
              ))}
            </div>
          </div>
          <div className="card-body">
            <div className="stat-grid" style={{ marginBottom: 0 }}>
              <div className="stat-card"><div className="label">Signups (today)</div><div className="value">{sum.signups_today ?? 0}</div></div>
              <div className="stat-card"><div className="label">Signups (month)</div><div className="value">{sum.signups_month ?? 0}</div></div>
              <div className="stat-card"><div className="label">Tunnels (today)</div><div className="value">{sum.tunnels_today ?? 0}</div></div>
              <div className="stat-card"><div className="label">Tunnels (month)</div><div className="value">{sum.tunnels_month ?? 0}</div></div>
              <div className="stat-card"><div className="label">Revenue (month)</div><div className="value">₹{sum.revenue_month ?? 0}</div></div>
              <div className="stat-card"><div className="label">Pro Users</div><div className="value">{sum.pro_users ?? 0} / {sum.total_users ?? users.length}</div></div>
            </div>
          </div>
        </div>
      )}

      {/* Recent tunnels */}
      <div className="card">
        <div className="card-header">
          <h2>🔗 Recent Tunnel Activity</h2>
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄 Refresh</button>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Subdomain</th><th>User</th><th>URL</th><th>Status</th><th>Requests</th><th>Data</th><th>Created</th></tr></thead>
            <tbody>
              {recent.map((t, i) => (
                <tr key={i}>
                  <td className="code">{t.subdomain}</td>
                  <td>{t.user_email}</td>
                  <td className="code" style={{ fontSize: '.75rem' }}>https://{t.subdomain}.iraglobaltech.com</td>
                  <td><span className={`badge ${t.status === 'connected' ? 'badge-green' : ''}`}>{t.status}</span></td>
                  <td>{t.request_count}</td>
                  <td>{formatBytes(t.bytes_transferred)}</td>
                  <td className="dim">{String(t.created_at || '').substring(0, 16)}</td>
                </tr>
              ))}
              {!recent.length && <tr><td colSpan="7" className="empty">No tunnel activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* System info */}
      <div className="card">
        <div className="card-header"><h2>🖥️ System Info</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <tbody>
              <tr><td>API Base</td><td className="code">/api/v1</td></tr>
              <tr><td>Swagger Docs</td><td><a href="/docs" target="_blank" rel="noreferrer">/docs</a></td></tr>
              <tr><td>ReDoc</td><td><a href="/redoc" target="_blank" rel="noreferrer">/redoc</a></td></tr>
              <tr><td>Health Check</td><td><a href="/health" target="_blank" rel="noreferrer">/health</a></td></tr>
              <tr><td>SSH Server</td><td className="code">{sysInfo ? `ssh.iraglobaltech.com:${sysInfo.ssh_port || 2222}` : '—'}</td></tr>
              <tr><td>Tunnel Domain</td><td className="code">{sysInfo?.tunnel_domain || 'iraglobaltech.com'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}