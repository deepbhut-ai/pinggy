import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { SearchBar, Pagination } from '../../components/TableControls';
import { formatBytes, copyToClipboard } from '../../utils';

// Admin Users — list, search, edit, enable/disable, quick Pro, view detail.
// APIs: GET /users, GET /tunnels/history, GET/PUT/DELETE /users/{id}

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [tunnels, setTunnels] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);      // selected user (view)
  const [editModal, setEditModal] = useState(null); // { user, form }
  const [confirm, setConfirm] = useState(null);     // { title, body, action }

  const load = useCallback(async () => {
    try {
      const [u, t] = await Promise.all([
        api('/users'),
        api('/tunnels/history?limit=500'),
      ]);
      setUsers(u); setTunnels(t);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const statsFor = (email) => {
    const mine = tunnels.filter((t) => t.user_email === email);
    return {
      active: mine.filter((t) => t.status === 'connected').length,
      requests: mine.reduce((s, t) => s + (t.request_count || 0), 0),
      data: mine.reduce((s, t) => s + (t.bytes_transferred || 0), 0),
      total: mine.length,
    };
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) => u.email.toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q))
    : users;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const userAction = async (desc, fn) => {
    setConfirm({ title: desc, body: 'Are you sure?', action: fn });
  };

  const doEdit = async () => {
    const { user, form } = editModal;
    const params = new URLSearchParams();
    if (form.email && form.email !== user.email) params.set('email', form.email);
    if (form.full_name !== undefined && form.full_name !== (user.full_name || '')) params.set('full_name', form.full_name);
    if (form.role && form.role !== user.role) params.set('role', form.role);
    if (form.password) params.set('password', form.password);
    try {
      await api(`/users/${user.id}?${params.toString()}`, 'PUT');
      toast(`User ${user.email} updated`);
      setEditModal(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const setActive = async (u, active) => {
    try {
      await api(`/users/${u.id}?is_active=${active}`, 'PUT');
      toast(`${u.email} ${active ? 'enabled' : 'disabled'}`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const quickPro = async (u) => {
    try {
      await api(`/users/${u.id}?plan=pro&duration_days=30`, 'PUT');
      toast(`${u.email} upgraded to Pro (30 days)`);
      load(); setDetail(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  const deleteUser = async (u) => {
    try {
      await api(`/users/${u.id}`, 'DELETE');
      toast(`User ${u.email} deleted`);
      setDetail(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveDomain = async (u, domain) => {
    try {
      await api(`/users/${u.id}?custom_domain=${encodeURIComponent(domain)}`, 'PUT');
      toast('Custom domain saved');
      load(); setDetail(null); setConfirm(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  const savePlan = async (u, plan, duration) => {
    try {
      await api(plan === 'pro' ? `/users/${u.id}?plan=pro&duration_days=${duration}` : `/users/${u.id}?plan=free`, 'PUT');
      toast(`Plan set to ${plan}`);
      load(); setDetail(null); setConfirm(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveSeats = async (u, seats) => {
    try {
      await api(`/users/${u.id}?seats=${seats}`, 'PUT');
      toast(`Seats set to ${seats}`);
      load(); setDetail(null); setConfirm(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  const stopTunnel = async (subdomain) => {
    try {
      await api(`/tunnels/${subdomain}/stop`, 'POST');
      toast(`Tunnel ${subdomain} stopped`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  // ---- Detail view ----
  if (detail) {
    const u = users.find((x) => x.id === detail) || detail;
    const st = statsFor(u.email);
    const myTunnels = tunnels.filter((t) => t.user_email === u.email);
    return (
      <>
        <div className="page-toolbar">
          <div>
            <div className="page-title">User: {u.email}</div>
            <div className="page-subtitle">{u.full_name || '—'} · {u.role} · {u.plan}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>← Back to Users</button>
        </div>

        <div className="stat-grid">
          <div className="stat-card"><div className="label">Total Tunnels</div><div className="value">{st.total}</div></div>
          <div className="stat-card"><div className="label">Active Now</div><div className="value">{st.active}</div></div>
          <div className="stat-card"><div className="label">Total Requests</div><div className="value">{st.requests.toLocaleString()}</div></div>
          <div className="stat-card"><div className="label">Total Data</div><div className="value">{formatBytes(st.data)}</div></div>
        </div>

        <div className="card">
          <div className="card-header"><h2>👤 Account</h2></div>
          <div className="card-body">
            <div className="cfg-row">
              <div className="form-group cfg-field">
                <label>Plan</label>
                <select defaultValue={u.plan} onChange={(e) => {
                  const plan = e.target.value;
                  if (plan === 'pro') {
                    const dur = window.prompt('Duration (days):', '30');
                    if (dur) userAction(`Activate Pro for ${u.email}`, () => savePlan(u, 'pro', dur));
                  } else userAction(`Set plan to Free for ${u.email}`, () => savePlan(u, 'free'));
                }}>
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              <div className="form-group" style={{ maxWidth: 140 }}>
                <label>Seats ({u.seats})</label>
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => { const n = Math.max(1, u.seats - 1); userAction(`Set seats to ${n}`, () => saveSeats(u, n)); }}>−</button>
                  <strong>{u.seats}</strong>
                  <button className="btn btn-sm btn-ghost" onClick={() => { const n = u.seats + 1; userAction(`Set seats to ${n}`, () => saveSeats(u, n)); }}>+</button>
                </div>
              </div>
              <div className="form-group cfg-field">
                <label>Custom domain {u.custom_domain ? '(current: ' + u.custom_domain + ')' : ''}</label>
                <div style={{ display: 'flex', gap: '.4rem' }}>
                  <input type="text" defaultValue={u.custom_domain || ''} id="admin-user-domain" placeholder="mydomain.com" />
                  <button className="btn btn-sm" onClick={() => userAction('Save custom domain', () => saveDomain(u, document.getElementById('admin-user-domain').value))}>Save</button>
                </div>
              </div>
              {u.plan_expires_at && (
                <div className="form-group"><label>Plan expires</label><div className="dim" style={{ paddingTop: '.4rem' }}>{u.plan_expires_at.substring(0, 10)}</div></div>
              )}
            </div>
            <div className="cfg-row">
              <div className="form-group cfg-field">
                <label>Tunnel token</label>
                <div className="code" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', paddingTop: '.4rem' }}>
                  {u.tunnel_token ? `${u.tunnel_token.slice(0, 10)}…` : '—'}
                  {u.tunnel_token && <button className="icon-btn" onClick={() => { copyToClipboard(u.tunnel_token); toast('Copied'); }}>📋</button>}
                </div>
              </div>
              <div className="form-group"><label>User ID</label><div className="code dim" style={{ paddingTop: '.4rem' }}>{u.id}</div></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>🔗 Their tunnels ({myTunnels.length})</h2></div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead><tr><th>#</th><th>Subdomain</th><th>Port</th><th>Requests</th><th>Data</th><th>Status</th><th>Created</th><th></th></tr></thead>
              <tbody>
                {myTunnels.map((t, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="code">{t.subdomain}</td>
                    <td>{t.remote_port}</td>
                    <td>{t.request_count}</td>
                    <td>{formatBytes(t.bytes_transferred)}</td>
                    <td><span className={`badge ${t.status === 'connected' ? 'badge-green' : ''}`}>{t.status}</span></td>
                    <td className="dim">{String(t.created_at || '').substring(0, 16)}</td>
                    <td>
                      {t.status === 'connected' && (
                        <button className="btn btn-sm btn-danger" onClick={() => userAction(`Stop tunnel ${t.subdomain}`, () => stopTunnel(t.subdomain))}>Stop</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!myTunnels.length && <tr><td colSpan="8" className="empty">No tunnels.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ borderColor: 'rgba(222,95,75,.4)' }}>
          <div className="card-header"><h2>⚠️ Danger Zone</h2></div>
          <div className="card-body">
            <button className="btn btn-danger" onClick={() => userAction(`Delete user ${u.email}? Their tunnels will be removed.`, () => deleteUser(u))}>🗑️ Delete User</button>
          </div>
        </div>

        {editModal && renderEditModal()}
        {confirm && <ConfirmModal confirm={confirm} setConfirm={setConfirm} />}
      </>
    );
  }

  const renderEditModal = () => (
    <Modal title={`Edit ${editModal.user.email}`} confirmLabel="Save" onConfirm={doEdit} onClose={() => setEditModal(null)}>
      <div className="form-group"><label>Email</label>
        <input type="text" defaultValue={editModal.user.email} onChange={(e) => setEditModal({ ...editModal, form: { ...editModal.form, email: e.target.value } })} /></div>
      <div className="form-group"><label>Full name</label>
        <input type="text" defaultValue={editModal.user.full_name || ''} onChange={(e) => setEditModal({ ...editModal, form: { ...editModal.form, full_name: e.target.value } })} /></div>
      <div className="form-group"><label>Role</label>
        <select defaultValue={editModal.user.role} onChange={(e) => setEditModal({ ...editModal, form: { ...editModal.form, role: e.target.value } })}>
          <option value="user">user</option><option value="admin">admin</option>
        </select></div>
      <div className="form-group"><label>New password (leave blank to keep)</label>
        <input type="text" placeholder="(unchanged)" onChange={(e) => setEditModal({ ...editModal, form: { ...editModal.form, password: e.target.value } })} /></div>
    </Modal>
  );

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Users ({users.length})</div>
          <div className="page-subtitle">Manage accounts, plans and access</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search email, name…" />
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Plan</th><th>Seats</th><th>Status</th><th>Active</th><th>Requests</th><th>Data</th><th></th></tr></thead>
            <tbody>
              {paged.map((u) => {
                const st = statsFor(u.email);
                return (
                  <tr key={u.id}>
                    <td><a href="#" onClick={(e) => { e.preventDefault(); setDetail(u.id); }}>{u.email}</a></td>
                    <td>{u.full_name || '—'}</td>
                    <td><span className={`badge ${u.role === 'admin' ? 'badge-green' : ''}`}>{u.role}</span></td>
                    <td><span className={`badge ${u.plan === 'pro' ? 'badge-blue' : ''}`}>{u.plan}</span></td>
                    <td>{u.seats}</td>
                    <td>{u.is_active ? (st.active ? <span style={{ color: 'var(--green)' }}>● Online</span> : <span className="dim">● Offline</span>) : <span style={{ color: 'var(--red)' }}>● Disabled</span>}</td>
                    <td>{st.active}</td>
                    <td>{st.requests.toLocaleString()}</td>
                    <td>{formatBytes(st.data)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="icon-btn" title="Edit" onClick={() => setEditModal({ user: u, form: {} })}>✏️</button>{' '}
                      {u.is_active
                        ? <button className="icon-btn" title="Disable" onClick={() => userAction(`Disable ${u.email}?`, () => setActive(u, false))}>🚫</button>
                        : <button className="icon-btn" title="Enable" onClick={() => setActive(u, true)}>✅</button>}{' '}
                      {u.plan !== 'pro' && <button className="icon-btn" title="Upgrade to Pro (30d)" onClick={() => userAction(`Upgrade ${u.email} to Pro?`, () => quickPro(u))}>⭐</button>}
                    </td>
                  </tr>
                );
              })}
              {!paged.length && <tr><td colSpan="10" className="empty">No users match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card-body" style={{ paddingTop: '.5rem' }}>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} total={filtered.length} pageSize={pageSize} />
        </div>
      </div>

      {editModal && renderEditModal()}
      {confirm && <ConfirmModal confirm={confirm} setConfirm={setConfirm} />}
    </>
  );
}

// Small confirm dialog wrapper around Modal
function ConfirmModal({ confirm, setConfirm }) {
  return (
    <Modal title={confirm.title} confirmLabel="Confirm" onClose={() => setConfirm(null)} onConfirm={async () => { await confirm.action(); setConfirm(null); }}>
      <p className="dim">{confirm.body}</p>
    </Modal>
  );
}