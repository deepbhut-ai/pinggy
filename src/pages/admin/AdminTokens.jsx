import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { SearchBar, Pagination } from '../../components/TableControls';
import { formatBytes } from '../../utils';

// Admin: All Tokens — list every token across all users, regen/delete.
// APIs: GET /tokens/admin/all, POST /tokens/admin/{id}/regenerate, DELETE /tokens/admin/{id}

export default function AdminTokens() {
  const toast = useToast();
  const [tokens, setTokens] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setTokens(await api('/tokens/admin/all'));
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q ? tokens.filter((t) =>
    (t.user_email || '').toLowerCase().includes(q) || (t.name || '').toLowerCase().includes(q) ||
    (t.subdomain || '').toLowerCase().includes(q) || (t.custom_domain || '').toLowerCase().includes(q)
  ) : tokens;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totalReq = tokens.reduce((s, t) => s + (t.total_requests || 0), 0);
  const totalData = tokens.reduce((s, t) => s + (t.total_bytes || 0), 0);

  const regen = async (t) => {
    try {
      await api(`/tokens/admin/${t.id}/regenerate`, 'POST');
      toast(`Token regenerated for ${t.user_email}`);
      setConfirm(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const del = async (t) => {
    try {
      await api(`/tokens/admin/${t.id}`, 'DELETE');
      toast(`Token deleted (${t.user_email})`);
      setConfirm(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">All Tokens ({tokens.length})</div>
          <div className="page-subtitle">Every tunnel token across all users</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search user, name…" />
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Total Tokens</div><div className="value">{tokens.length}</div></div>
        <div className="stat-card"><div className="label">Total Requests</div><div className="value">{totalReq.toLocaleString()}</div></div>
        <div className="stat-card"><div className="label">Total Data</div><div className="value">{formatBytes(totalData)}</div></div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>#</th><th>Token</th><th>Name</th><th>User</th><th>Subdomain</th><th>Custom domain</th><th>Requests</th><th>Data</th><th>Active</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {paged.map((t, i) => (
                <tr key={t.id}>
                  <td>{(page - 1) * pageSize + i + 1}</td>
                  <td className="code">{t.token?.slice(0, 10)}…</td>
                  <td>{t.name || '—'}</td>
                  <td>{t.user_email}</td>
                  <td className="code">{t.subdomain}</td>
                  <td className="code">{t.custom_domain || '—'}</td>
                  <td>{(t.total_requests || 0).toLocaleString()}</td>
                  <td>{formatBytes(t.total_bytes)}</td>
                  <td>{t.active_tunnels || 0}</td>
                  <td className="dim">{String(t.created_at || '').substring(0, 10)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title="Regenerate" onClick={() => setConfirm({ title: `Regenerate token for ${t.user_email}? The old token stops working.`, action: () => regen(t) })}>🔄</button>{' '}
                    <button className="icon-btn" title="Delete" onClick={() => setConfirm({ title: `Delete token of ${t.user_email}? Their tunnels stop working.`, action: () => del(t) })}>🗑️</button>
                  </td>
                </tr>
              ))}
              {!paged.length && <tr><td colSpan="11" className="empty">No tokens.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card-body" style={{ paddingTop: '.5rem' }}>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} total={filtered.length} pageSize={pageSize} />
        </div>
      </div>

      {confirm && (
        <Modal title={confirm.title} confirmLabel="Confirm" onClose={() => setConfirm(null)}
          onConfirm={async () => { await confirm.action(); setConfirm(null); }}>
          <p className="dim">This action cannot be undone.</p>
        </Modal>
      )}
    </>
  );
}