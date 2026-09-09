import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { SearchBar, Pagination } from '../../components/TableControls';

// Admin: IP Monitor — live visitors, blocked IPs, countries, auto-block config.
// APIs: GET /ip-monitor/stats, /ip-monitor/config, /ip-monitor/blocked,
//       /ip-monitor/ips?limit=N, /ip-monitor/ips/{ip},
//       POST /ip-monitor/block { ip, reason, duration }, POST /ip-monitor/unblock { ip },
//       PUT /ip-monitor/config { auto_block_enabled, rate_window_seconds, block_threshold, block_duration_seconds }
// Polls stats + live IPs every 5s while on the page.

const REASONS = ['manual', 'ddos', 'scanning', 'brute_force', 'suspicious'];
const DURATIONS = [[3600, '1 hour'], [21600, '6 hours'], [86400, '1 day'], [604800, '7 days'], [0, 'permanent']];

export default function AdminIpMonitor() {
  const toast = useToast();
  const [tab, setTab] = useState('live');
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [ips, setIps] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [limit, setLimit] = useState(100);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [blockModal, setBlockModal] = useState(null); // { ip, reason, duration }
  const [confirm, setConfirm] = useState(null);
  const pollRef = useRef(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const loadOnce = useCallback(async () => {
    try {
      const [st, cfg] = await Promise.all([
        api('/ip-monitor/stats').catch(() => null),
        api('/ip-monitor/config').catch(() => null),
      ]);
      if (st) setStats(st);
      if (cfg) setConfig(cfg);
      api('/ip-monitor/blocked').then((d) => setBlocked(d.blocked || d)).catch(() => {});
      api(`/ip-monitor/ips?limit=${limit}`).then((d) => setIps(d.ips || d)).catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  }, [toast, limit]);

  useEffect(() => { loadOnce(); }, [loadOnce]);

  // 5s polling — stats always, live IPs only on the live tab
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const st = await api('/ip-monitor/stats').catch(() => null);
        if (st) setStats(st);
        if (tabRef.current === 'live') {
          const l = await api(`/ip-monitor/ips?limit=${limit}`).catch(() => null);
          if (l) setIps(l.ips || l);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [limit]);

  const q = search.trim().toLowerCase();
  const filteredIps = q ? ips.filter((i) => (i.ip || '').includes(q) || (i.country || '').toLowerCase().includes(q)) : ips;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredIps.length / pageSize));
  const pagedIps = filteredIps.slice((page - 1) * pageSize, page * pageSize);

  const viewIp = async (ip) => {
    try { setDetail(await api(`/ip-monitor/ips/${encodeURIComponent(ip)}`)); }
    catch (e) { toast(e.message, 'error'); }
  };

  const block = async () => {
    try {
      await api('/ip-monitor/block', 'POST', {
        ip: blockModal.ip.trim(),
        reason: blockModal.reason,
        duration: Number(blockModal.duration) || 999999999,
      });
      toast(`IP ${blockModal.ip} blocked`);
      setBlockModal(null); loadOnce();
    } catch (e) { toast(e.message, 'error'); }
  };

  const unblock = async (ip) => {
    try {
      await api('/ip-monitor/unblock', 'POST', { ip });
      toast(`IP ${ip} unblocked`);
      setConfirm(null); loadOnce();
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveConfig = async () => {
    try {
      await api('/ip-monitor/config', 'PUT', {
        auto_block_enabled: config.auto_block_enabled,
        rate_window_seconds: Number(config.rate_window_seconds),
        block_threshold: Number(config.block_threshold),
        block_duration_seconds: Number(config.block_duration_seconds),
      });
      toast('IP monitor config saved');
      loadOnce();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">IP Monitor</div>
          <div className="page-subtitle">Live visitors, abuse detection, blocking</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => setBlockModal({ ip: '', reason: 'manual', duration: 3600 })}>🚫 Block IP</button>
          <button className="btn btn-sm btn-ghost" onClick={() => { loadOnce(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Tracked IPs</div><div className="value">{stats?.tracked_ips ?? '—'}</div></div>
        <div className="stat-card"><div className="label">Blocked IPs</div><div className="value" style={{ color: 'var(--red)' }}>{stats?.blocked_ips ?? '—'}</div></div>
        <div className="stat-card"><div className="label">Rate Window</div><div className="value">{stats?.rate_window_seconds ?? '—'}s</div></div>
        <div className="stat-card"><div className="label">Block Threshold</div><div className="value">{stats?.block_threshold ?? '—'}</div></div>
      </div>

      {stats?.enabled === false && (
        <div className="banner banner-amber" style={{ marginBottom: '1rem' }}>
          ⚠️ Redis is not connected — live IP tracking is off. Start Redis and refresh.
        </div>
      )}

      <div className="tabs" style={{ marginBottom: '.75rem' }}>
        {[['live', '📡 Live IPs'], ['blocked', '🚫 Blocked'], ['countries', '🌍 Countries'], ['config', '⚙️ Config']].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'live' && (
        <div className="card">
          <div className="card-header">
            <h2>Live IPs ({ips.length})</h2>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search IP…" style={{ maxWidth: 160 }} />
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 'auto' }}>
                {[50, 100, 200, 500].map((n) => <option key={n} value={n}>last {n}</option>)}
              </select>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead><tr><th>IP</th><th>Country</th><th>City</th><th>ISP</th><th>Requests</th><th>Window</th><th>Tunnels</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {pagedIps.map((i, idx) => {
                  const isBlocked = blocked.some((b) => b.ip === i.ip);
                  const hot = (i.window_count || 0) > 100;
                  return (
                    <tr key={idx}>
                      <td className="code">{i.ip}</td>
                      <td>{i.country || '—'}</td>
                      <td>{i.city || '—'}</td>
                      <td className="dim" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.isp || '—'}</td>
                      <td>{i.total_requests ?? i.requests ?? 0}</td>
                      <td>{i.window_count ?? 0}</td>
                      <td>{i.tunnels_visited || i.tunnels || '—'}</td>
                      <td className="dim">{String(i.last_seen || '').substring(5, 16)}</td>
                      <td>
                        <span className={`badge ${isBlocked ? '' : hot ? '' : 'badge-green'}`} style={isBlocked || hot ? { color: 'var(--red)' } : undefined}>
                          {isBlocked ? 'Blocked' : hot ? 'High' : 'Active'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="icon-btn" title="Details" onClick={() => viewIp(i.ip)}>👁️</button>{' '}
                        {!isBlocked && <button className="icon-btn" title="Block" onClick={() => setBlockModal({ ip: i.ip, reason: 'manual', duration: 3600 })}>🚫</button>}
                      </td>
                    </tr>
                  );
                })}
                {!filteredIps.length && <tr><td colSpan="10" className="empty">No tracked IPs.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card-body" style={{ paddingTop: '.5rem' }}>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={filteredIps.length} pageSize={pageSize} />
          </div>
        </div>
      )}

      {tab === 'blocked' && (
        <div className="card">
          <div className="card-header"><h2>Blocked IPs ({blocked.length})</h2></div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead><tr><th>IP</th><th>Reason</th><th>Blocked at</th><th></th></tr></thead>
              <tbody>
                {blocked.map((b, i) => (
                  <tr key={i}>
                    <td className="code">{b.ip}</td>
                    <td><span className="badge">{b.reason}</span></td>
                    <td className="dim">{String(b.blocked_at || '').substring(0, 16)}</td>
                    <td><button className="btn btn-sm" onClick={() => setConfirm({ title: `Unblock ${b.ip}?`, action: () => unblock(b.ip) })}>Unblock</button></td>
                  </tr>
                ))}
                {!blocked.length && <tr><td colSpan="4" className="empty">No blocked IPs.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'countries' && (
        <div className="card">
          <div className="card-header"><h2>Top Countries</h2></div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Country</th><th>IP Count</th></tr></thead>
              <tbody>
                {Object.entries(stats?.top_countries || {}).map(([c, n]) => (
                  <tr key={c}><td>{c}</td><td>{n}</td></tr>
                ))}
                {!Object.keys(stats?.top_countries || {}).length && <tr><td colSpan="2" className="empty">No data.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'config' && config && (
        <div className="card">
          <div className="card-header"><h2>Auto-Block Config</h2></div>
          <div className="card-body">
            <div className="dim" style={{ fontSize: '.8rem', marginBottom: '.75rem' }}>
              Redis: {config.redis_connected ? '✅ connected' : '❌ off'} · Geo lookup: {config.geo_lookup || '—'} · Source: {config.source || '—'}
            </div>
            <div className="cfg-row">
              <div className="form-group" style={{ maxWidth: 220 }}>
                <label>Auto-block enabled</label>
                <select value={config.auto_block_enabled ? '1' : ''} onChange={(e) => setConfig({ ...config, auto_block_enabled: e.target.value === '1' })}>
                  <option value="1">Enabled</option><option value="">Disabled</option>
                </select>
              </div>
              <div className="form-group" style={{ maxWidth: 160 }}>
                <label>Rate window (seconds)</label>
                <input type="number" value={config.rate_window_seconds ?? 60} onChange={(e) => setConfig({ ...config, rate_window_seconds: e.target.value })} />
              </div>
              <div className="form-group" style={{ maxWidth: 160 }}>
                <label>Block threshold (requests)</label>
                <input type="number" value={config.block_threshold ?? 1000} onChange={(e) => setConfig({ ...config, block_threshold: e.target.value })} />
              </div>
              <div className="form-group" style={{ maxWidth: 160 }}>
                <label>Block duration (seconds)</label>
                <input type="number" value={config.block_duration_seconds ?? 3600} onChange={(e) => setConfig({ ...config, block_duration_seconds: e.target.value })} />
              </div>
              <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                <button className="btn btn-sm" onClick={saveConfig}>💾 Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <Modal title={`IP ${detail.ip}`} confirmLabel="Close" onConfirm={() => setDetail(null)} onClose={() => setDetail(null)}>
          <table><tbody>
            <tr><td className="dim">Status</td><td>{detail.is_blocked ? '🚫 Blocked' : 'Active'}</td></tr>
            <tr><td className="dim">Total requests</td><td>{detail.total_requests ?? '—'}</td></tr>
            <tr><td className="dim">Window count</td><td>{detail.window_count ?? '—'}</td></tr>
            <tr><td className="dim">Country</td><td>{detail.country || '—'} {detail.country_code ? `(${detail.country_code})` : ''}</td></tr>
            <tr><td className="dim">City</td><td>{detail.city || '—'}</td></tr>
            <tr><td className="dim">ISP</td><td>{detail.isp || '—'}</td></tr>
            <tr><td className="dim">Lat/Lon</td><td>{detail.lat}, {detail.lon}</td></tr>
            <tr><td className="dim">User agent</td><td className="dim">{detail.user_agent || '—'}</td></tr>
            <tr><td className="dim">Last path</td><td className="code">{detail.last_path || '—'}</td></tr>
            <tr><td className="dim">Tunnels visited</td><td className="code">{detail.tunnels_visited || '—'}</td></tr>
            <tr><td className="dim">Last seen</td><td>{String(detail.last_seen || '').substring(0, 19)}</td></tr>
          </tbody></table>
        </Modal>
      )}

      {blockModal && (
        <Modal title="Block IP" confirmLabel="Block" onConfirm={block} onClose={() => setBlockModal(null)}>
          <div className="form-group"><label>IP address</label>
            <input type="text" value={blockModal.ip} onChange={(e) => setBlockModal({ ...blockModal, ip: e.target.value })} placeholder="1.2.3.4" /></div>
          <div className="form-group"><label>Reason</label>
            <select value={blockModal.reason} onChange={(e) => setBlockModal({ ...blockModal, reason: e.target.value })}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select></div>
          <div className="form-group"><label>Duration</label>
            <select value={blockModal.duration} onChange={(e) => setBlockModal({ ...blockModal, duration: e.target.value })}>
              {DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} confirmLabel="Confirm" onClose={() => setConfirm(null)}
          onConfirm={async () => { await confirm.action(); setConfirm(null); }}>
          <p className="dim">Are you sure?</p>
        </Modal>
      )}
    </>
  );
}