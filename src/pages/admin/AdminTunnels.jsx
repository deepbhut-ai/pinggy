import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { SearchBar, Pagination } from '../../components/TableControls';
import { formatBytes } from '../../utils';

// Admin: All Tunnels — history across all users.
// API: GET /tunnels/history?limit=500

export default function AdminTunnels() {
  const toast = useToast();
  const [tunnels, setTunnels] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setTunnels(await api('/tunnels/history?limit=500'));
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q ? tunnels.filter((t) =>
    (t.subdomain || '').toLowerCase().includes(q) || (t.user_email || '').toLowerCase().includes(q)
  ) : tunnels;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const active = tunnels.filter((t) => t.status === 'connected').length;

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">All Tunnels ({tunnels.length})</div>
          <div className="page-subtitle">Tunnel history across all users</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search subdomain, user…" />
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Total Tunnels</div><div className="value">{tunnels.length}</div></div>
        <div className="stat-card"><div className="label">Active Now</div><div className="value" style={{ color: active ? 'var(--green)' : undefined }}>{active}</div></div>
        <div className="stat-card"><div className="label">Disconnected</div><div className="value">{tunnels.length - active}</div></div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>#</th><th>Subdomain</th><th>User</th><th>URL</th><th>Port</th><th>Requests</th><th>↓ In</th><th>↑ Out</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {paged.map((t, i) => (
                <tr key={i}>
                  <td>{(page - 1) * pageSize + i + 1}</td>
                  <td className="code">{t.subdomain}</td>
                  <td>{t.user_email}</td>
                  <td className="code" style={{ fontSize: '.72rem' }}>https://{t.subdomain}.iraglobaltech.com</td>
                  <td>{t.remote_port}</td>
                  <td>{t.request_count}</td>
                  <td>{formatBytes(t.bytes_received)}</td>
                  <td>{formatBytes(t.bytes_sent)}</td>
                  <td><span className={`badge ${t.status === 'connected' ? 'badge-green' : ''}`}>{t.status}</span></td>
                  <td className="dim">{String(t.created_at || '').substring(0, 16)}</td>
                </tr>
              ))}
              {!paged.length && <tr><td colSpan="10" className="empty">No tunnels.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card-body" style={{ paddingTop: '.5rem' }}>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} total={filtered.length} pageSize={pageSize} />
        </div>
      </div>
    </>
  );
}