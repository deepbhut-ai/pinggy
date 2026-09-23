import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { SearchBar, Pagination } from '../../components/TableControls';

// Admin: IP Monitor — live visitors, blocked IPs, whitelisted IPs, countries, auto-block config.
// APIs: GET /ip-monitor/stats, /ip-monitor/config, /ip-monitor/blocked, /ip-monitor/whitelisted,
//       /ip-monitor/ips?limit=N, /ip-monitor/ips/{ip},
//       POST /ip-monitor/block { ip, reason, duration }, POST /ip-monitor/unblock { ip },
//       POST /ip-monitor/whitelist { ip, reason }, POST /ip-monitor/unwhitelist { ip },
//       PUT /ip-monitor/config { auto_block_enabled, rate_window_seconds, block_threshold, block_duration_seconds }
// Polls stats + live IPs every 5s while on the page.

const REASONS = ['manual', 'ddos', 'scanning', 'brute_force', 'suspicious'];
const DURATIONS = [[3600, '1 hour'], [21600, '6 hours'], [86400, '1 day'], [604800, '7 days'], [0, 'permanent']];
const WHITELIST_PRESETS = ['Office VPN', 'Admin IP', 'Webhook Provider', 'Monitoring Bot', 'Developer Machine', 'Trusted Client', 'manual'];

export default function AdminIpMonitor() {
  const toast = useToast();
  const [tab, setTab] = useState('live');
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [ips, setIps] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [whitelisted, setWhitelisted] = useState([]);
  const [limit, setLimit] = useState(100);

  // Live IPs search & pagination
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Whitelisted IPs search & pagination
  const [searchWhitelist, setSearchWhitelist] = useState('');
  const [pageWhitelist, setPageWhitelist] = useState(1);

  // Blocked IPs search & pagination
  const [searchBlocked, setSearchBlocked] = useState('');
  const [pageBlocked, setPageBlocked] = useState(1);

  const [detail, setDetail] = useState(null);
  const [blockModal, setBlockModal] = useState(null); // { ip, reason, duration }
  const [whitelistModal, setWhitelistModal] = useState(null); // { ip, reason }
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
      api('/ip-monitor/whitelisted').then((d) => setWhitelisted(d.whitelisted || d)).catch(() => {});
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

  // Filtered & Paginated Live IPs
  const qLive = search.trim().toLowerCase();
  const filteredIps = qLive ? ips.filter((i) => (i.ip || '').includes(qLive) || (i.country || '').toLowerCase().includes(qLive) || (i.city || '').toLowerCase().includes(qLive) || (i.isp || '').toLowerCase().includes(qLive)) : ips;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredIps.length / pageSize));
  const pagedIps = filteredIps.slice((page - 1) * pageSize, page * pageSize);

  // Filtered & Paginated Whitelisted IPs
  const qWl = searchWhitelist.trim().toLowerCase();
  const filteredWhitelist = qWl
    ? whitelisted.filter((w) => (w.ip || '').includes(qWl) || (w.reason || '').toLowerCase().includes(qWl) || (w.added_by || '').toLowerCase().includes(qWl))
    : whitelisted;
  const totalWhitelistPages = Math.max(1, Math.ceil(filteredWhitelist.length / pageSize));
  const pagedWhitelist = filteredWhitelist.slice((pageWhitelist - 1) * pageSize, pageWhitelist * pageSize);

  // Filtered & Paginated Blocked IPs
  const qBlk = searchBlocked.trim().toLowerCase();
  const filteredBlocked = qBlk
    ? blocked.filter((b) => (b.ip || '').includes(qBlk) || (b.reason || '').toLowerCase().includes(qBlk))
    : blocked;
  const totalBlockedPages = Math.max(1, Math.ceil(filteredBlocked.length / pageSize));
  const pagedBlocked = filteredBlocked.slice((pageBlocked - 1) * pageSize, pageBlocked * pageSize);

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
      setBlockModal(null);
      loadOnce();
    } catch (e) { toast(e.message, 'error'); }
  };

  const unblock = async (ip) => {
    try {
      await api('/ip-monitor/unblock', 'POST', { ip });
      toast(`IP ${ip} unblocked`);
      setConfirm(null);
      loadOnce();
    } catch (e) { toast(e.message, 'error'); }
  };

  const addToWhitelist = async () => {
    try {
      await api('/ip-monitor/whitelist', 'POST', {
        ip: whitelistModal.ip.trim(),
        reason: whitelistModal.reason?.trim() || 'manual',
      });
      toast(`IP ${whitelistModal.ip} added to whitelist`);
      setWhitelistModal(null);
      loadOnce();
    } catch (e) { toast(e.message, 'error'); }
  };

  const removeFromWhitelist = async (ip) => {
    try {
      await api('/ip-monitor/unwhitelist', 'POST', { ip });
      toast(`IP ${ip} removed from whitelist`);
      setConfirm(null);
      loadOnce();
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
          <div className="page-subtitle">Live visitors, abuse detection, blocking & whitelisting</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <button className="btn btn-sm btn-outline" onClick={() => setWhitelistModal({ ip: '', reason: 'Office VPN' })}>🛡️ Whitelist IP</button>
          <button className="btn btn-sm" onClick={() => setBlockModal({ ip: '', reason: 'manual', duration: 3600 })}>🚫 Block IP</button>
          <button className="btn btn-sm btn-ghost" onClick={() => { loadOnce(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Tracked IPs</div><div className="value">{stats?.tracked_ips ?? ips.length ?? '—'}</div></div>
        <div className="stat-card"><div className="label">Blocked IPs</div><div className="value" style={{ color: 'var(--red)' }}>{stats?.blocked_ips ?? blocked.length ?? '—'}</div></div>
        <div className="stat-card"><div className="label">Whitelisted IPs</div><div className="value" style={{ color: 'var(--green, #10b981)' }}>{stats?.whitelisted_ips ?? whitelisted.length ?? '—'}</div></div>
        <div className="stat-card"><div className="label">Rate Window</div><div className="value">{stats?.rate_window_seconds ?? config?.rate_window_seconds ?? '—'}s</div></div>
        <div className="stat-card"><div className="label">Block Threshold</div><div className="value">{stats?.block_threshold ?? config?.block_threshold ?? '—'}</div></div>
      </div>

      {stats?.enabled === false && (
        <div className="banner banner-amber" style={{ marginBottom: '1rem' }}>
          ⚠️ Redis is not connected — live IP tracking is off. Start Redis and refresh.
        </div>
      )}

      <div className="tabs" style={{ marginBottom: '.75rem' }}>
        {[
          ['live', `📡 Live IPs (${ips.length})`],
          ['blocked', `🚫 Blocked (${blocked.length})`],
          ['whitelisted', `🛡️ Whitelisted (${whitelisted.length})`],
          ['countries', '🌍 Countries'],
          ['config', '⚙️ Config'],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* 📡 Live IPs Tab */}
      {tab === 'live' && (
        <div className="card">
          <div className="card-header">
            <h2>Live Tracked IPs ({ips.length})</h2>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search IP, country, ISP…" style={{ maxWidth: 220 }} />
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 'auto' }}>
                {[50, 100, 200, 500].map((n) => <option key={n} value={n}>last {n}</option>)}
              </select>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead><tr><th>IP</th><th>Country</th><th>City</th><th>ISP</th><th>Requests</th><th>Window</th><th>Tunnels</th><th>Last seen</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {pagedIps.map((i, idx) => {
                  const isBlocked = blocked.some((b) => b.ip === i.ip);
                  const isWl = whitelisted.some((w) => w.ip === i.ip);
                  const hot = (i.window_count || 0) > 100;
                  return (
                    <tr key={idx}>
                      <td className="code" style={{ fontWeight: 600 }}>{i.ip}</td>
                      <td>{i.country || '—'}</td>
                      <td>{i.city || '—'}</td>
                      <td className="dim" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.isp || '—'}</td>
                      <td>{i.total_requests ?? i.requests ?? 0}</td>
                      <td>{i.window_count ?? 0}</td>
                      <td>{i.tunnels_visited || i.tunnels || '—'}</td>
                      <td className="dim">{String(i.last_seen || '').substring(5, 16)}</td>
                      <td>
                        {isWl ? (
                          <span className="badge badge-green">🛡️ Whitelisted</span>
                        ) : isBlocked ? (
                          <span className="badge" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>🚫 Blocked</span>
                        ) : hot ? (
                          <span className="badge" style={{ color: 'var(--amber, #f59e0b)' }}>⚡ High</span>
                        ) : (
                          <span className="badge badge-green">● Active</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="icon-btn" title="View details" onClick={() => viewIp(i.ip)}>👁️</button>{' '}
                        {!isWl && (
                          <button className="icon-btn" title="Add to whitelist" onClick={() => setWhitelistModal({ ip: i.ip, reason: 'Office VPN' })}>🛡️</button>
                        )}{' '}
                        {!isBlocked && !isWl && (
                          <button className="icon-btn" title="Block IP" onClick={() => setBlockModal({ ip: i.ip, reason: 'manual', duration: 3600 })}>🚫</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filteredIps.length && <tr><td colSpan="10" className="empty">No tracked IPs found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card-body" style={{ paddingTop: '.5rem' }}>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={filteredIps.length} pageSize={pageSize} />
          </div>
        </div>
      )}

      {/* 🚫 Blocked IPs Tab */}
      {tab === 'blocked' && (
        <div className="card">
          <div className="card-header">
            <h2>Blocked IPs ({blocked.length})</h2>
            <SearchBar value={searchBlocked} onChange={(v) => { setSearchBlocked(v); setPageBlocked(1); }} placeholder="Search blocked IP…" style={{ maxWidth: 220 }} />
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead><tr><th>IP</th><th>Reason</th><th>Blocked at</th><th>Actions</th></tr></thead>
              <tbody>
                {pagedBlocked.map((b, i) => (
                  <tr key={i}>
                    <td className="code" style={{ fontWeight: 600, color: 'var(--red)' }}>{b.ip}</td>
                    <td><span className="badge">{b.reason}</span></td>
                    <td className="dim">{String(b.blocked_at || '').substring(0, 19).replace('T', ' ')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => setConfirm({ title: `Unblock ${b.ip}?`, action: () => unblock(b.ip) })}>Unblock</button>{' '}
                      <button className="btn btn-sm btn-ghost" onClick={() => setWhitelistModal({ ip: b.ip, reason: 'Unblocked & Whitelisted' })}>🛡️ Whitelist</button>
                    </td>
                  </tr>
                ))}
                {!filteredBlocked.length && <tr><td colSpan="4" className="empty">No blocked IPs found.</td></tr>}
              </tbody>
            </table>
          </div>
          {filteredBlocked.length > pageSize && (
            <div className="card-body" style={{ paddingTop: '.5rem' }}>
              <Pagination page={pageBlocked} totalPages={totalBlockedPages} setPage={setPageBlocked} total={filteredBlocked.length} pageSize={pageSize} />
            </div>
          )}
        </div>
      )}

      {/* 🛡️ Whitelisted IPs Tab */}
      {tab === 'whitelisted' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Whitelisted IPs ({whitelisted.length})</h2>
              <div className="dim" style={{ fontSize: '.8rem', marginTop: '.2rem' }}>
                Whitelisted IPs are exempt from rate limits and will never be auto-blocked by the defense engine.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <SearchBar value={searchWhitelist} onChange={(v) => { setSearchWhitelist(v); setPageWhitelist(1); }} placeholder="Search whitelisted IP, note…" style={{ maxWidth: 240 }} />
              <button className="btn btn-sm" onClick={() => setWhitelistModal({ ip: '', reason: 'Office VPN' })}>+ Add IP</button>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead><tr><th>IP Address</th><th>Reason / Note</th><th>Added By</th><th>Added At</th><th>Actions</th></tr></thead>
              <tbody>
                {pagedWhitelist.map((w, i) => (
                  <tr key={i}>
                    <td className="code" style={{ fontWeight: 600, color: 'var(--green, #10b981)' }}>{w.ip}</td>
                    <td><span className="badge badge-green">{w.reason || 'manual'}</span></td>
                    <td className="dim">{w.added_by || 'admin'}</td>
                    <td className="dim">{String(w.added_at || '').substring(0, 19).replace('T', ' ') || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="icon-btn" title="View details" onClick={() => viewIp(w.ip)}>👁️</button>{' '}
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--red)' }}
                        onClick={() => setConfirm({ title: `Remove ${w.ip} from Whitelist?`, action: () => removeFromWhitelist(w.ip) })}
                      >
                        ✕ Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredWhitelist.length && (
                  <tr>
                    <td colSpan="5" className="empty" style={{ padding: '2rem' }}>
                      No whitelisted IPs found. Click <strong>"🛡️ Whitelist IP"</strong> to whitelist trusted addresses.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredWhitelist.length > pageSize && (
            <div className="card-body" style={{ paddingTop: '.5rem' }}>
              <Pagination page={pageWhitelist} totalPages={totalWhitelistPages} setPage={setPageWhitelist} total={filteredWhitelist.length} pageSize={pageSize} />
            </div>
          )}
        </div>
      )}

      {/* 🌍 Countries Tab */}
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
                {!Object.keys(stats?.top_countries || {}).length && <tr><td colSpan="2" className="empty">No data available.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ⚙️ Config Tab */}
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

      {/* Modal: View IP Details */}
      {detail && (
        <Modal title={`IP Details: ${detail.ip}`} confirmLabel="Close" onConfirm={() => setDetail(null)} onClose={() => setDetail(null)}>
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
            <tr><td className="dim">Last seen</td><td>{String(detail.last_seen || '').substring(0, 19).replace('T', ' ')}</td></tr>
          </tbody></table>
        </Modal>
      )}

      {/* Modal: Whitelist IP */}
      {whitelistModal && (
        <Modal title="🛡️ Add IP to Whitelist" confirmLabel="Add to Whitelist" onConfirm={addToWhitelist} onClose={() => setWhitelistModal(null)}>
          <div className="form-group">
            <label>IP address</label>
            <input
              type="text"
              value={whitelistModal.ip}
              onChange={(e) => setWhitelistModal({ ...whitelistModal, ip: e.target.value })}
              placeholder="e.g. 103.240.76.163"
              required
            />
          </div>
          <div className="form-group">
            <label>Reason / Preset</label>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
              {WHITELIST_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={`btn btn-xs ${whitelistModal.reason === p ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '.75rem', padding: '.2rem .5rem' }}
                  onClick={() => setWhitelistModal({ ...whitelistModal, reason: p })}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={whitelistModal.reason}
              onChange={(e) => setWhitelistModal({ ...whitelistModal, reason: e.target.value })}
              placeholder="Reason or label (e.g. Office Router, Stripe Webhook)"
            />
          </div>
        </Modal>
      )}

      {/* Modal: Block IP */}
      {blockModal && (
        <Modal title="🚫 Block IP Address" confirmLabel="Block IP" onConfirm={block} onClose={() => setBlockModal(null)}>
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

      {/* Modal: Confirm Action */}
      {confirm && (
        <Modal title={confirm.title} confirmLabel="Confirm" onClose={() => setConfirm(null)}
          onConfirm={async () => { await confirm.action(); setConfirm(null); }}>
          <p className="dim">Are you sure you want to perform this action?</p>
        </Modal>
      )}
    </>
  );
}