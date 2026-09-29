import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { SearchBar } from '../../components/TableControls';

const FLAG_MAP = {
  in: '🇮🇳',
  us: '🇺🇸',
  eu: '🇪🇺',
  uk: '🇬🇧',
  gb: '🇬🇧',
  de: '🇩🇪',
  fr: '🇫🇷',
  sg: '🇸🇬',
  jp: '🇯🇵',
  au: '🇦🇺',
  ca: '🇨🇦',
  nl: '🇳🇱',
  br: '🇧🇷',
};

const COMMON_FLAGS = ['🇮🇳', '🇺🇸', '🇪🇺', '🇬🇧', '🇩🇪', '🇸🇬', '🇯🇵', '🇦🇺', '🇨🇦', '🌐'];

export default function AdminRegions() {
  const toast = useToast();
  const [regions, setRegions] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [commandModal, setCommandModal] = useState(null);
  const [pingResults, setPingResults] = useState({});
  const [pinging, setPinging] = useState({});

  // Form states for Add / Edit
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    flag: '🌐',
    server_ip: '',
    ssh_host: '',
    ssh_port: 2222,
    proxy_domain: '',
    max_capacity: 1000,
    is_active: true,
    is_maintenance: false,
    sort_order: 0,
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('/admin/regions');
      setRegions(data);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePing = async (code) => {
    setPinging((prev) => ({ ...prev, [code]: true }));
    try {
      const res = await api(`/admin/regions/${code}/ping`, 'POST');
      setPingResults((prev) => ({ ...prev, [code]: res }));
      if (res.reachable) {
        toast(`⚡ ${res.name}: ${res.latency_ms}ms`, 'success');
      } else {
        toast(`⚠️ ${res.name}: Unreachable (${res.message})`, 'error');
      }
    } catch (e) {
      toast(e.message, 'error');
      setPingResults((prev) => ({ ...prev, [code]: { reachable: false, message: e.message } }));
    } finally {
      setPinging((prev) => ({ ...prev, [code]: false }));
    }
  };

  const handleToggleDrain = async (code) => {
    try {
      const res = await api(`/admin/regions/${code}/drain`, 'POST');
      toast(res.message);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handleShowCommand = async (r) => {
    try {
      const data = await api(`/admin/regions/${r.code}/join-command`);
      setCommandModal(data);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handleCreate = async () => {
    if (!formData.code || !formData.name || !formData.server_ip || !formData.ssh_host || !formData.proxy_domain) {
      toast('Please fill in all required fields', 'error');
      return;
    }
    try {
      const res = await api('/admin/regions', 'POST', {
        ...formData,
        ssh_port: parseInt(formData.ssh_port, 10) || 2222,
        max_capacity: parseInt(formData.max_capacity, 10) || 1000,
        sort_order: parseInt(formData.sort_order, 10) || 0,
      });
      toast(`Region ${formData.name} registered successfully`);
      setAddModal(false);
      setFormData({
        code: '',
        name: '',
        flag: '🌐',
        server_ip: '',
        ssh_host: '',
        ssh_port: 2222,
        proxy_domain: '',
        max_capacity: 1000,
        is_active: true,
        is_maintenance: false,
        sort_order: 0,
      });
      load();
      if (res && res.code) {
        handleShowCommand(res);
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handleUpdate = async () => {
    if (!editModal) return;
    try {
      await api(`/admin/regions/${editModal.code}`, 'PUT', {
        name: editModal.name,
        flag: editModal.flag,
        server_ip: editModal.server_ip,
        ssh_host: editModal.ssh_host,
        ssh_port: parseInt(editModal.ssh_port, 10) || 2222,
        proxy_domain: editModal.proxy_domain,
        max_capacity: parseInt(editModal.max_capacity, 10) || 1000,
        is_active: editModal.is_active,
        is_maintenance: editModal.is_maintenance,
        sort_order: parseInt(editModal.sort_order, 10) || 0,
      });
      toast(`Region ${editModal.code} updated`);
      setEditModal(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    try {
      await api(`/admin/regions/${deleteModal.code}`, 'DELETE');
      toast(`Region ${deleteModal.code} decommissioned`);
      setDeleteModal(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? regions.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.server_ip.toLowerCase().includes(q) ||
          r.ssh_host.toLowerCase().includes(q)
      )
    : regions;

  const totalCapacity = regions.reduce((s, r) => s + (r.max_capacity || 0), 0);
  const activeCount = regions.filter((r) => r.is_active && !r.is_maintenance).length;
  const maintenanceCount = regions.filter((r) => r.is_maintenance).length;
  const totalTunnels = regions.reduce((s, r) => s + (r.active_tunnels || 0), 0);

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">🌍 Edge Regions & PoPs ({regions.length})</div>
          <div className="page-subtitle">Manage global ingress nodes, server capacities, and live heartbeats</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search region, IP, host…" />
          <button className="btn btn-sm btn-ghost" onClick={load} title="Refresh">
            🔄
          </button>
          <button className="btn btn-sm" onClick={() => setAddModal(true)}>
            ➕ Add Edge Region
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Regions</div>
          <div className="value">{regions.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Active Ingress Nodes</div>
          <div className="value" style={{ color: 'var(--green)' }}>
            {activeCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Drain / Maintenance</div>
          <div className="value" style={{ color: maintenanceCount > 0 ? '#f59e0b' : undefined }}>
            {maintenanceCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Total Capacity</div>
          <div className="value">
            {totalTunnels} / {totalCapacity}
          </div>
        </div>
      </div>

      {/* Regions Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Code</th>
                <th>Server IP</th>
                <th>SSH Endpoint</th>
                <th>Proxy Wildcard</th>
                <th>Capacity</th>
                <th>Health Probe</th>
                <th>Status</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const probe = pingResults[r.code];
                const isPinging = pinging[r.code];
                const capPct = Math.min(100, Math.round(((r.active_tunnels || 0) / (r.max_capacity || 1000)) * 100));

                return (
                  <tr key={r.code}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>{r.flag || '🌐'}</span>
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge">{r.code.toUpperCase()}</span>
                    </td>
                    <td className="code" style={{ fontSize: '.84rem' }}>
                      {r.server_ip}
                    </td>
                    <td className="code" style={{ fontSize: '.84rem' }}>
                      {r.ssh_host}:{r.ssh_port}
                    </td>
                    <td className="code" style={{ fontSize: '.84rem' }}>
                      *.{r.proxy_domain}
                    </td>
                    <td>
                      <div style={{ minWidth: 100 }}>
                        <div style={{ fontSize: '.78rem', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                          <span>{r.active_tunnels || 0} active</span>
                          <span className="dim">/{r.max_capacity}</span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            borderRadius: 3,
                            background: 'var(--surface-2, #333)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${capPct}%`,
                              height: '100%',
                              background: capPct > 80 ? 'var(--red, #ef4444)' : 'var(--brand, #6366f1)',
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      {isPinging ? (
                        <span className="dim" style={{ fontSize: '.78rem' }}>Testing…</span>
                      ) : probe ? (
                        probe.reachable ? (
                          <span className="badge badge-green" style={{ fontSize: '.75rem' }}>
                            🟢 {probe.latency_ms}ms
                          </span>
                        ) : (
                          <span className="badge badge-red" style={{ fontSize: '.75rem' }} title={probe.message}>
                            🔴 Offline
                          </span>
                        )
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ fontSize: '.74rem', padding: '.15rem .45rem' }}
                          onClick={() => handlePing(r.code)}
                        >
                          ⚡ Test Ping
                        </button>
                      )}
                    </td>
                    <td>
                      {r.is_maintenance ? (
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                          ⏸️ Drain Mode
                        </span>
                      ) : r.is_active ? (
                        <span className="badge badge-green">🟢 Active</span>
                      ) : (
                        <span className="badge" style={{ opacity: 0.6 }}>Disabled</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ fontSize: '.74rem', padding: '.2rem .4rem' }}
                          title="1-Line Install Command & Cloudflare DNS"
                          onClick={() => handleShowCommand(r)}
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ fontSize: '.74rem', padding: '.2rem .4rem' }}
                          title="Ping node"
                          onClick={() => handlePing(r.code)}
                          disabled={isPinging}
                        >
                          ⚡
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ fontSize: '.74rem', padding: '.2rem .4rem' }}
                          title={r.is_maintenance ? 'Resume node' : 'Drain / Maintenance'}
                          onClick={() => handleToggleDrain(r.code)}
                        >
                          {r.is_maintenance ? '▶️' : '⏸️'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ fontSize: '.74rem', padding: '.2rem .4rem' }}
                          title="Edit region"
                          onClick={() => setEditModal({ ...r })}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          style={{ fontSize: '.74rem', padding: '.2rem .4rem' }}
                          title="Decommission node"
                          onClick={() => setDeleteModal(r)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }} className="dim">
                    No edge regions found. Click "Add Edge Region" above to register one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Region Modal */}
      {addModal && (
        <Modal
          title="➕ Register New Edge Region"
          confirmLabel="Add Region"
          onConfirm={handleCreate}
          onClose={() => setAddModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
            <div style={{ display: 'flex', gap: '.75rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Region Code (slug)*</label>
                <input
                  type="text"
                  placeholder="e.g. us, eu, de, in"
                  value={formData.code}
                  onChange={(e) => {
                    const codeVal = e.target.value.toLowerCase().trim();
                    const autoFlag = FLAG_MAP[codeVal] || formData.flag;
                    setFormData({
                      ...formData,
                      code: codeVal,
                      flag: autoFlag,
                      ssh_host: codeVal ? `${codeVal}.ssh.iraglobaltech.com` : formData.ssh_host,
                      proxy_domain: codeVal ? `${codeVal}.iraglobaltech.com` : formData.proxy_domain,
                    });
                  }}
                />
              </div>
              <div className="form-group" style={{ width: 110 }}>
                <label>Flag Emoji</label>
                <input
                  type="text"
                  placeholder="🇺🇸"
                  value={formData.flag}
                  onChange={(e) => setFormData({ ...formData, flag: e.target.value })}
                />
              </div>
            </div>

            {/* Quick clickable flag buttons — no need to open any picker or select dropdown */}
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', marginTop: '-.35rem' }}>
              {COMMON_FLAGS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{
                    padding: '.15rem .35rem',
                    fontSize: '1.1rem',
                    lineHeight: 1,
                    borderRadius: 4,
                    background: formData.flag === f ? 'rgba(96, 165, 250, 0.2)' : 'rgba(255,255,255,0.05)',
                    border: formData.flag === f ? '1px solid var(--brand, #60a5fa)' : '1px solid transparent',
                  }}
                  onClick={() => setFormData({ ...formData, flag: f })}
                  title={`Select ${f}`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="form-group">
              <label>Region Display Name*</label>
              <input
                type="text"
                placeholder="e.g. North America (US East - N. Virginia)"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: '.75rem' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Edge Server Public IP*</label>
                <input
                  type="text"
                  placeholder="e.g. 54.160.82.11"
                  value={formData.server_ip}
                  onChange={(e) => setFormData({ ...formData, server_ip: e.target.value.trim() })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>SSH Port</label>
                <input
                  type="number"
                  value={formData.ssh_port}
                  onChange={(e) => setFormData({ ...formData, ssh_port: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Regional SSH Ingress Hostname*</label>
              <input
                type="text"
                placeholder="e.g. us.ssh.iraglobaltech.com"
                value={formData.ssh_host}
                onChange={(e) => setFormData({ ...formData, ssh_host: e.target.value.trim().toLowerCase() })}
              />
              <span className="dim" style={{ fontSize: '.72rem' }}>
                Developers in this region will connect via <code>ssh -p 2222 token@{formData.ssh_host || 'us.ssh.iraglobaltech.com'}</code>
              </span>
            </div>

            <div className="form-group">
              <label>Regional Proxy Wildcard Domain*</label>
              <input
                type="text"
                placeholder="e.g. us.iraglobaltech.com"
                value={formData.proxy_domain}
                onChange={(e) => setFormData({ ...formData, proxy_domain: e.target.value.trim().toLowerCase() })}
              />
              <span className="dim" style={{ fontSize: '.72rem' }}>
                Tunnels will resolve via <code>*.{formData.proxy_domain || 'us.iraglobaltech.com'}</code>
              </span>
            </div>

            <div style={{ display: 'flex', gap: '.75rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Max Tunnel Capacity</label>
                <input
                  type="number"
                  value={formData.max_capacity}
                  onChange={(e) => setFormData({ ...formData, max_capacity: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Sort Order</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '.25rem' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                Active (available for new connections)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.is_maintenance}
                  onChange={(e) => setFormData({ ...formData, is_maintenance: e.target.checked })}
                />
                Drain / Maintenance Mode
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Region Modal */}
      {editModal && (
        <Modal
          title={`✏️ Edit Region: ${editModal.code.toUpperCase()}`}
          confirmLabel="Save Changes"
          onConfirm={handleUpdate}
          onClose={() => setEditModal(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
            <div style={{ display: 'flex', gap: '.75rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Display Name</label>
                <input
                  type="text"
                  value={editModal.name}
                  onChange={(e) => setEditModal({ ...editModal, name: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ width: 110 }}>
                <label>Flag</label>
                <input
                  type="text"
                  value={editModal.flag}
                  onChange={(e) => setEditModal({ ...editModal, flag: e.target.value })}
                />
              </div>
            </div>

            {/* Quick clickable flag buttons */}
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', marginTop: '-.35rem' }}>
              {COMMON_FLAGS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{
                    padding: '.15rem .35rem',
                    fontSize: '1.1rem',
                    lineHeight: 1,
                    borderRadius: 4,
                    background: editModal.flag === f ? 'rgba(96, 165, 250, 0.2)' : 'rgba(255,255,255,0.05)',
                    border: editModal.flag === f ? '1px solid var(--brand, #60a5fa)' : '1px solid transparent',
                  }}
                  onClick={() => setEditModal({ ...editModal, flag: f })}
                  title={`Select ${f}`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '.75rem' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Server IP</label>
                <input
                  type="text"
                  value={editModal.server_ip}
                  onChange={(e) => setEditModal({ ...editModal, server_ip: e.target.value.trim() })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>SSH Port</label>
                <input
                  type="number"
                  value={editModal.ssh_port}
                  onChange={(e) => setEditModal({ ...editModal, ssh_port: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>SSH Hostname</label>
              <input
                type="text"
                value={editModal.ssh_host}
                onChange={(e) => setEditModal({ ...editModal, ssh_host: e.target.value.trim().toLowerCase() })}
              />
            </div>

            <div className="form-group">
              <label>Proxy Wildcard Domain</label>
              <input
                type="text"
                value={editModal.proxy_domain}
                onChange={(e) => setEditModal({ ...editModal, proxy_domain: e.target.value.trim().toLowerCase() })}
              />
            </div>

            <div style={{ display: 'flex', gap: '.75rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Max Tunnel Capacity</label>
                <input
                  type="number"
                  value={editModal.max_capacity}
                  onChange={(e) => setEditModal({ ...editModal, max_capacity: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Sort Order</label>
                <input
                  type="number"
                  value={editModal.sort_order}
                  onChange={(e) => setEditModal({ ...editModal, sort_order: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '.25rem' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editModal.is_active}
                  onChange={(e) => setEditModal({ ...editModal, is_active: e.target.checked })}
                />
                Active
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editModal.is_maintenance}
                  onChange={(e) => setEditModal({ ...editModal, is_maintenance: e.target.checked })}
                />
                Drain / Maintenance Mode
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* 1-Line Command & Cloudflare DNS Modal */}
      {commandModal && (
        <Modal
          title={`🚀 Bootstrap Node: ${commandModal.name} (${commandModal.code.toUpperCase()})`}
          confirmLabel="Done"
          onConfirm={() => setCommandModal(null)}
          onClose={() => setCommandModal(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '.9rem' }}>
              Run this <strong>1-line command</strong> on your remote server (<code>{commandModal.server_ip}</code>) to automatically install the edge proxy, start the systemd service, and connect back to this control plane:
            </p>

            <div>
              <pre
                style={{
                  background: 'var(--surface-2, #181b26)',
                  padding: '.85rem',
                  borderRadius: 6,
                  fontSize: '.82rem',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  border: '1px solid var(--border, #2d3748)',
                  color: 'var(--brand, #60a5fa)',
                  fontFamily: 'monospace',
                  margin: 0,
                }}
              >
                {commandModal.command}
              </pre>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: '.5rem', width: '100%' }}
                onClick={() => {
                  navigator.clipboard.writeText(commandModal.command);
                  toast('Copied setup command to clipboard!', 'success');
                }}
              >
                📋 Copy 1-Line Setup Command
              </button>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '.85rem',
                borderRadius: 6,
                border: '1px solid var(--border, #2d3748)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: '.4rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                <span>☁️ Cloudflare DNS Records Required</span>
              </div>
              <p className="dim" style={{ fontSize: '.78rem', margin: '0 0 .5rem 0' }}>
                If Cloudflare API is configured, these are created automatically. Otherwise, verify these 2 records in your Cloudflare DNS:
              </p>
              <table style={{ fontSize: '.75rem', margin: 0 }}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Target IP</th>
                    <th>Proxy Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>A</code></td>
                    <td className="code">{commandModal.code}.ssh</td>
                    <td className="code">{commandModal.server_ip}</td>
                    <td><span className="badge">⚪ DNS Only (Grey)</span></td>
                  </tr>
                  <tr>
                    <td><code>A</code></td>
                    <td className="code">*.{commandModal.code}</td>
                    <td className="code">{commandModal.server_ip}</td>
                    <td><span className="badge badge-green">🟠 Proxied (Orange)</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <Modal
          title={`⚠️ Decommission Region: ${deleteModal.name}`}
          confirmLabel="Decommission Node"
          onConfirm={handleDelete}
          onClose={() => setDeleteModal(null)}
        >
          <p>
            Are you sure you want to decommission the edge region <strong>{deleteModal.name} ({deleteModal.code.toUpperCase()})</strong>?
          </p>
          <p className="dim" style={{ fontSize: '.85rem' }}>
            New connections will no longer be routed to <code>{deleteModal.ssh_host}</code>. Ensure any DNS records pointing to <code>{deleteModal.server_ip}</code> are updated.
          </p>
        </Modal>
      )}
    </>
  );
}
