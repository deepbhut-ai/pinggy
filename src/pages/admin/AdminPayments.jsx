import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { SearchBar, Pagination } from '../../components/TableControls';

// Admin: Payments — all payments + revenue stats.
// APIs: GET /payments/admin/all, GET /payments/admin/stats

export default function AdminPayments() {
  const toast = useToast();
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [all, st] = await Promise.all([
        api('/payments/admin/all'),
        api('/payments/admin/stats').catch(() => null),
      ]);
      setPayments(all); setStats(st);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q ? payments.filter((p) =>
    (p.user_email || '').toLowerCase().includes(q) || (p.method || '').toLowerCase().includes(q) ||
    (p.status || '').toLowerCase().includes(q)
  ) : payments;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Payments ({payments.length})</div>
          <div className="page-subtitle">All payment attempts and revenue</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search user, method…" />
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Total Payments</div><div className="value">{payments.length}</div></div>
        {stats?.revenue && Object.entries(stats.revenue).map(([cur, amt]) => (
          <div className="stat-card" key={cur}><div className="label">Revenue ({cur})</div><div className="value">{Number(amt).toLocaleString()}</div></div>
        ))}
        {stats?.by_status && Object.entries(stats.by_status).map(([st, n]) => (
          <div className="stat-card" key={st}><div className="label">{st}</div><div className="value">{n}</div></div>
        ))}
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>#</th><th>User</th><th>Method</th><th>Plan</th><th>Amount</th><th>Status</th><th>Ref</th><th>Created</th></tr></thead>
            <tbody>
              {paged.map((p, i) => (
                <tr key={i}>
                  <td>{(page - 1) * pageSize + i + 1}</td>
                  <td>{p.user_email}</td>
                  <td>{p.method}</td>
                  <td><span className="badge">{p.plan}</span></td>
                  <td>{p.currency} {p.amount}</td>
                  <td><span className={`badge ${p.status === 'paid' ? 'badge-green' : ''}`}>{p.status}</span></td>
                  <td className="code" style={{ fontSize: '.7rem' }}>{(p.provider_ref || '').slice(0, 20)}</td>
                  <td className="dim">{String(p.created_at || '').substring(0, 16)}</td>
                </tr>
              ))}
              {!paged.length && <tr><td colSpan="8" className="empty">No payments.</td></tr>}
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