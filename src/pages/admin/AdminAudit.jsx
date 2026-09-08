import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { SearchBar, Pagination } from '../../components/TableControls';

// Admin: Audit Log — who did what.
// API: GET /audit?limit=200

export default function AdminAudit() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setLogs(await api('/audit?limit=200'));
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q ? logs.filter((l) =>
    (l.actor_email || '').toLowerCase().includes(q) || (l.action || '').toLowerCase().includes(q) ||
    (l.target || '').toLowerCase().includes(q) || (l.details || '').toLowerCase().includes(q)
  ) : logs;
  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Audit Log ({logs.length})</div>
          <div className="page-subtitle">Every privileged action, newest first</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search actor, action…" />
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>
              {paged.map((l, i) => (
                <tr key={i}>
                  <td className="dim" style={{ whiteSpace: 'nowrap' }}>{String(l.created_at || '').substring(0, 19)}</td>
                  <td>{l.actor_email}</td>
                  <td><span className="badge badge-blue">{l.action}</span></td>
                  <td className="code" style={{ fontSize: '.75rem' }}>{l.target || '—'}</td>
                  <td className="dim">{l.details || '—'}</td>
                </tr>
              ))}
              {!paged.length && <tr><td colSpan="5" className="empty">No entries.</td></tr>}
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