import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { formatBytes } from '../../utils';

// Active Tunnels — /tunnels/my with rate tracking + per-row debug + pagination
const PAGE_SIZES = [10, 20, 50, 100];

export default function ActiveTunnels() {
  const toast = useToast();
  const [tunnels, setTunnels] = useState([]);
  const [history, setHistory] = useState([]);
  const [debugOpen, setDebugOpen] = useState(null); // subdomain
  const [captures, setCaptures] = useState({ entries: [], count: 0 });
  const rateRef = useRef({});
  const pollRef = useRef(null);
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // History pagination (separate)
  const [histPage, setHistPage] = useState(1);
  const [histPageSize, setHistPageSize] = useState(10);

  const load = useCallback(async () => {
    try {
      const t = await api('/tunnels/my');
      // Only live running tunnels — hide disconnected/dead ones
      const live = t.filter((tn) => tn.status === 'active');
      const now = Date.now();
      const next = {};
      live.forEach((tn) => {
        const id = tn.tunnel_id || tn.subdomain;
        next[id] = { lastBytes: tn.bytes_transferred || 0, lastTime: now, prev: rateRef.current[id] };
      });
      rateRef.current = next;
      setTunnels(live);
    } catch (e) { /* silent poll */ }
  }, []);

  useEffect(() => {
    load();
    api('/manage/tunnels').then((d) => setHistory(d.history || [])).catch(() => {});
    pollRef.current = setInterval(load, 3000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(tunnels.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = tunnels.slice((safePage - 1) * pageSize, safePage * pageSize);
  // keep the current page valid when the live list shrinks (tunnels disconnect)
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  // History pagination
  const histTotalPages = Math.max(1, Math.ceil(history.length / histPageSize));
  const safeHistPage = Math.min(histPage, histTotalPages);
  const pagedHistory = history.slice((safeHistPage - 1) * histPageSize, safeHistPage * histPageSize);
  useEffect(() => { if (histPage > histTotalPages) setHistPage(histTotalPages); }, [histPage, histTotalPages]);

  const openDebug = async (sub) => {
    setDebugOpen(sub);
    try {
      const d = await api(`/debugger/${sub}`);
      setCaptures(d);
    } catch (e) { toast(e.message, 'error'); }
  };

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
      <h2 style={{ marginBottom: '.4rem' }}>Active Tunnels</h2>
      <p className="dim" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>{tunnels.length} live tunnel{tunnels.length !== 1 ? 's' : ''} running</p>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {tunnels.length === 0 ? (
            <p className="empty">No live tunnels running right now. Start a tunnel from the Quickstart page.</p>
          ) : (
            <>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Tunnel URL</th><th>Subdomain</th><th>Requests</th>
                  <th>↓ Received</th><th>↑ Sent</th><th>Transfer Rate</th>
                  <th>Status</th><th>Created</th><th>Inspector</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((t, i) => (
                  <tr key={t.tunnel_id || t.subdomain}>
                    <td>{(safePage - 1) * pageSize + i + 1}</td>
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
                    <td style={{ color: 'var(--green)' }}>↓ {formatBytes(t.bytes_received || 0)}</td>
                    <td style={{ color: 'var(--brand)' }}>↑ {formatBytes(t.bytes_sent || 0)}</td>
                    <td>{kbpsOf(t)} KB/s</td>
                    <td><span className="badge badge-green">{t.status}</span></td>
                    <td>{(t.created_at || '').replace('T', ' ').substring(0, 19)}</td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => openDebug(t.subdomain)} title="Inspect captured requests">🔍 Debug</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem', padding: '.7rem 1rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.8rem' }} className="dim">
                Rows per page
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ width: 'auto', padding: '.25rem .4rem' }}>
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span>· showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, tunnels.length)} of {tunnels.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <button className="btn btn-sm btn-ghost" disabled={safePage === 1} onClick={() => setPage(1)}>«</button>
                <button className="btn btn-sm btn-ghost" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
                <span className="dim" style={{ fontSize: '.8rem', padding: '0 .4rem' }}>Page {safePage} / {totalPages}</span>
                <button className="btn btn-sm btn-ghost" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next ›</button>
                <button className="btn btn-sm btn-ghost" disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Recent history */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2>Recent history</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {history.length === 0 ? (
            <p className="empty">No tunnel history yet.</p>
          ) : (
            <>
            <table>
              <thead><tr><th>Subdomain</th><th>Remote port</th><th>Status</th><th>Requests</th><th>Bytes</th><th>Created</th></tr></thead>
              <tbody>
                {pagedHistory.map((t) => (
                  <tr key={t.tunnel_id || t.subdomain}>
                    <td className="code">{t.subdomain}</td>
                    <td>{t.remote_port}</td>
                    <td><span className="badge">{t.status}</span></td>
                    <td>{t.requests}</td>
                    <td>{formatBytes(t.bytes)}</td>
                    <td>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* History pagination */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem', padding: '.7rem 1rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.8rem' }} className="dim">
                Rows per page
                <select value={histPageSize} onChange={(e) => { setHistPageSize(Number(e.target.value)); setHistPage(1); }} style={{ width: 'auto', padding: '.25rem .4rem' }}>
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span>· showing {(safeHistPage - 1) * histPageSize + 1}–{Math.min(safeHistPage * histPageSize, history.length)} of {history.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <button className="btn btn-sm btn-ghost" disabled={safeHistPage === 1} onClick={() => setHistPage(1)}>«</button>
                <button className="btn btn-sm btn-ghost" disabled={safeHistPage === 1} onClick={() => setHistPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
                <span className="dim" style={{ fontSize: '.8rem', padding: '0 .4rem' }}>Page {safeHistPage} / {histTotalPages}</span>
                <button className="btn btn-sm btn-ghost" disabled={safeHistPage === histTotalPages} onClick={() => setHistPage((p) => Math.min(histTotalPages, p + 1))}>Next ›</button>
                <button className="btn btn-sm btn-ghost" disabled={safeHistPage === histTotalPages} onClick={() => setHistPage(histTotalPages)}>»</button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Debug modal (inline) */}
      {debugOpen && (
        <div className="modal-overlay" onClick={() => setDebugOpen(null)}>
          <div className="modal-box modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">🔍 Debugger — {debugOpen}</h3>
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
                <span className="dim" style={{ fontSize: '.8rem' }}>{captures.count} captured request{captures.count !== 1 ? 's' : ''} (last 100, 1h)</span>
                <button className="btn btn-sm btn-danger" onClick={async () => {
                  try { await api(`/debugger/${debugOpen}`, 'DELETE'); openDebug(debugOpen); } catch (e) { toast(e.message, 'error'); }
                }}>Clear</button>
              </div>
              <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
                <table style={{ fontSize: '.8rem' }}>
                  <thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Replay</th></tr></thead>
                  <tbody>
                    {(captures.entries || []).map((e, idx) => (
                      <DebugRow key={idx} e={e} i={idx} sub={debugOpen} onReplay={async (i2) => {
                        try {
                          const r = await api(`/debugger/${debugOpen}/replay`, 'POST', { index: i2 });
                          toast(`Replayed → ${r.status} (${r.elapsed_ms}ms)`);
                          openDebug(debugOpen);
                        } catch (err) { toast(err.message, 'error'); }
                      }} />
                    ))}
                    {(captures.entries || []).length === 0 && (
                      <tr><td colSpan="5" className="empty">No captured requests yet — send some traffic to this tunnel first.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setDebugOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DebugRow({ e, i, sub, onReplay }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <td className="code" style={{ fontSize: '.72rem' }}>{new Date(e.ts * 1000).toLocaleTimeString()}</td>
        <td><span className="badge">{e.method}</span></td>
        <td className="code" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.path}</td>
        <td><span className={`badge ${e.status < 400 ? 'badge-green' : 'badge-red'}`}>{e.status}</span></td>
        <td>
          <button className="btn btn-sm" onClick={(ev) => { ev.stopPropagation(); onReplay(i); }} title="Replay this request">↻</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan="5" style={{ background: 'var(--bg)' }}>
            <div className="mono-detail">
              {'REQ HEADERS:\n' + Object.entries(e.req_headers || {}).map(([k, v]) => k + ': ' + v).join('\n')}
              {'\n\nRESP HEADERS:\n' + Object.entries(e.resp_headers || {}).map(([k, v]) => k + ': ' + v).join('\n')}
              {'\n\nBODY (first 2KB):\n' + (e.body || '').substring(0, 2048)}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}