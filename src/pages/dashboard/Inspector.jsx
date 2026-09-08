import { useEffect, useState, useCallback, Fragment } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { useTableData, SearchBar, Pagination } from '../../components/TableControls';

// Inspector — standalone debugger with live+token subdomains, expandable rows, replay
export default function Inspector() {
  const toast = useToast();
  const [tunnels, setTunnels] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState(null);
  const [openRow, setOpenRow] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    Promise.all([
      api('/tunnels/my').catch(() => []),
      api('/tokens').catch(() => []),
    ]).then(([t, tk]) => {
      setTunnels(t);
      setTokens(tk);
      // Auto-select the first available subdomain (live tunnels first, then tokens)
      const live = t.filter((tn) => tn.status === 'active').map((tn) => tn.subdomain);
      const tokenSubs = tk.map((tok) => tok.subdomain).filter(Boolean);
      const first = live[0] || tokenSubs[0] || '';
      if (first) setSelected(first);
    });
  }, []);

  const liveSubs = tunnels.filter((t) => t.status === 'active').map((t) => t.subdomain);
  const allSubs = [...new Set([...liveSubs, ...tokens.map((t) => t.subdomain).filter(Boolean)])];

  const refresh = useCallback(async (sub) => {
    const s = sub ?? selected;
    if (!s) return;
    setData(null);
    try {
      const d = await api(`/debugger/${s}`);
      setData(d);
    } catch (e) {
      // 403 = no active tunnel for this subdomain (token exists but tunnel isn't live)
      setData({ error: e.message, entries: [], count: 0 });
    }
  }, [selected]);

  useEffect(() => { if (selected) refresh(selected); }, [selected, refresh]);

  const replay = async (i) => {
    try {
      const r = await api(`/debugger/${selected}/replay`, 'POST', { index: i });
      toast(`Replayed → ${r.status} (${r.elapsed_ms}ms)`);
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  };

  const clear = async () => {
    try {
      await api(`/debugger/${selected}`, 'DELETE');
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-title">Inspector</div>
      <div className="page-subtitle">Inspect and replay requests hitting your tunnels</div>

      <div className="card">
        <div className="card-header">
          <h2>Tunnel</h2>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select a tunnel…</option>
              {allSubs.map((s) => (
                <option key={s} value={s}>{s}{liveSubs.includes(s) ? ' ● live' : ''}</option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => refresh()} disabled={!selected}>🔄</button>
          </div>
        </div>
        <div className="card-body">
          {!selected ? (
            <p className="empty">Pick a tunnel to see its captured traffic (last 100 requests, 1 hour).</p>
          ) : !data ? (
            <p className="empty">Loading…</p>
          ) : data.error ? (
            <div className="inline-note amber" style={{ margin: 0 }}>
              <span>⚠️ {data.error}</span>
              <span className="dim" style={{ fontSize: '.8rem' }}>— start a tunnel from <a href="/dashboard/quickstart" style={{ color: 'var(--brand)' }}>Quickstart</a>, then send traffic to it.</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.5rem' }}>
                <span className="dim" style={{ fontSize: '.8rem' }}>{data.count} captured request{data.count !== 1 ? 's' : ''}</span>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search path, method…" style={{ maxWidth: 240 }} />
                  <button className="btn btn-sm btn-danger" onClick={clear}>🗑 Clear</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                {(() => {
                  const entries = data.entries || [];
                  const q = search.trim().toLowerCase();
                  const filtered = q
                    ? entries.filter((e) => String(e.path || '').toLowerCase().includes(q) || String(e.method || '').toLowerCase().includes(q) || String(e.status || '').includes(q))
                    : entries;
                  const total = filtered.length;
                  const totalPages = Math.max(1, Math.ceil(total / pageSize));
                  const safePage = Math.min(page, totalPages);
                  const start = (safePage - 1) * pageSize;
                  const paged = filtered.slice(start, start + pageSize);
                  if (total === 0) return <tr><td colSpan="5" className="empty">No requests match your search.</td></tr>;
                  return (
                    <>
                      {paged.map((e, i) => {
                        const realIdx = start + i;
                        return (
                        <Fragment key={realIdx}>
                          <tr style={{ cursor: 'pointer' }} onClick={() => setOpenRow(openRow === realIdx ? null : realIdx)}>
                            <td className="code" style={{ fontSize: '.72rem' }}>{new Date(e.ts * 1000).toLocaleTimeString()}</td>
                            <td><span className="badge">{e.method}</span></td>
                            <td className="code" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.path}</td>
                            <td><span className={`badge ${e.status < 400 ? 'badge-green' : 'badge-red'}`}>{e.status}</span></td>
                            <td>
                              <button className="btn btn-sm" onClick={(ev) => { ev.stopPropagation(); replay(realIdx); }}>↻ Replay</button>
                            </td>
                          </tr>
                          {openRow === realIdx && (
                            <tr>
                              <td colSpan="5" style={{ background: 'var(--bg)' }}>
                                <div className="mono-detail">
                                  {'REQUEST HEADERS:\n' + Object.entries(e.req_headers || {}).map(([k, v]) => k + ': ' + v).join('\n')}
                                  {'\n\nRESPONSE HEADERS:\n' + Object.entries(e.resp_headers || {}).map(([k, v]) => k + ': ' + v).join('\n')}
                                  {'\n\nBODY:\n' + (e.body || '').substring(0, 2048)}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                        );
                      })}
                      <tr><td colSpan="5" style={{ borderTop: '1px solid var(--border)' }}>
                        <Pagination page={safePage} totalPages={totalPages} setPage={setPage} total={total} pageSize={pageSize} />
                      </td></tr>
                    </>
                  );
                })()}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}