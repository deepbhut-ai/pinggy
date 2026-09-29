import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { formatBytes } from '../../utils';

// Admin Dashboard — stats, insights, recent tunnels, system info, edge regions.
// APIs: GET /users, GET /tunnels/history, GET /payments/admin/stats,
//       GET /tunnels/info, GET /admin/regions, GET /analytics/overview?days=N

export default function AdminDashboard() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [tunnels, setTunnels] = useState([]);
  const [tunnelStats, setTunnelStats] = useState(null);
  const [activeTunnels, setActiveTunnels] = useState([]);
  const [payStats, setPayStats] = useState(null);
  const [sysInfo, setSysInfo] = useState(null);
  const [regions, setRegions] = useState([]);
  const [insights, setInsights] = useState(null);
  const [insightsDays, setInsightsDays] = useState(30);

  const load = useCallback(async () => {
    try {
      const [u, t, ts, act, ps, si, regs] = await Promise.all([
        api('/users?limit=200'),
        api('/tunnels/history?limit=500').catch(() => []),
        api('/tunnels/stats').catch(() => null),
        api('/tunnels').catch(() => []),
        api('/payments/admin/stats').catch(() => null),
        api('/tunnels/info').catch(() => null),
        api('/admin/regions').catch(() => []),
      ]);
      setUsers(u || []); setTunnels(t || []); setTunnelStats(ts); setActiveTunnels(act || []); setPayStats(ps); setSysInfo(si); setRegions(regs || []);
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

  const activeNow = tunnelStats?.active_tunnels ?? (activeTunnels.length || tunnels.filter((t) => t.status === 'active' || t.status === 'connected').length);
  const totalTunnelsCount = tunnelStats?.total_tunnels ?? tunnels.length;
  const totalRequests = tunnelStats?.total_requests ?? tunnels.reduce((s, t) => s + (t.request_count || 0), 0);
  const totalData = tunnelStats?.total_bytes_transferred ?? tunnels.reduce((s, t) => s + (t.bytes_transferred || 0), 0);
  const revenueEntries = payStats?.revenue ? Object.entries(payStats.revenue) : [];
  const recent = tunnels.slice(0, 10);
  const sum = insights?.summary || {};

  return (
    <>
      <div className="page-title">Admin Dashboard</div>
      <div className="page-subtitle">Platform overview — users, tunnels, revenue</div>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card"><div className="label">Total Users</div><div className="value">{users.length}</div></div>
        <div className="stat-card"><div className="label">Active Tunnels</div><div className="value" style={{ color: activeNow ? 'var(--green)' : undefined }}>{activeNow}</div></div>
        <div className="stat-card"><div className="label">Total Tunnels</div><div className="value">{totalTunnelsCount.toLocaleString()}</div></div>
        <div className="stat-card"><div className="label">Total Requests</div><div className="value">{totalRequests.toLocaleString()}</div></div>
        <div className="stat-card"><div className="label">Data Transfer</div><div className="value">{formatBytes(totalData)}</div></div>
        {revenueEntries.map(([cur, amt]) => (
          <div className="stat-card" key={cur}><div className="label">Revenue ({cur})</div><div className="value">{Number(amt).toLocaleString()}</div></div>
        ))}
        <div className="stat-card"><div className="label">Total Payments</div><div className="value">{payStats?.total_payments ?? '—'}</div></div>
        <div className="stat-card"><div className="label">Edge Regions</div><div className="value">{regions.filter(r => r.is_active && !r.is_maintenance).length || (regions.length ? 0 : 1)} <span style={{ fontSize: '0.85rem', color: 'var(--dim)' }}>/ {regions.length || 1}</span></div></div>
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
                  <td><span className={`badge ${t.status === 'active' || t.status === 'connected' ? 'badge-green' : ''}`}>{t.status}</span></td>
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

      {/* Edge Regions Overview */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>🌍 Edge Regions ({regions.length})</h2>
          <Link to="/dashboard/admin/regions" className="btn btn-sm btn-ghost">Manage Nodes →</Link>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Host</th>
                <th>Status</th>
                <th>Active Tunnels</th>
                <th>Capacity</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => (
                <tr key={r.code}>
                  <td><strong>{r.flag} {r.name}</strong> <span className="dim">({r.code})</span></td>
                  <td className="code">{r.ssh_host}:{r.ssh_port}</td>
                  <td>
                    {r.is_maintenance ? (
                      <span className="badge badge-amber">Maintenance</span>
                    ) : r.is_active ? (
                      <span className="badge badge-green">Operational</span>
                    ) : (
                      <span className="badge">Disabled</span>
                    )}
                  </td>
                  <td>{r.active_tunnels || 0}</td>
                  <td>{Math.min(100, Math.round(((r.active_tunnels || 0) / (r.max_capacity || 1000)) * 100))}%</td>
                </tr>
              ))}
              {!regions.length && (
                <tr>
                  <td colSpan="5" className="empty">No edge nodes registered yet.</td>
                </tr>
              )}
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