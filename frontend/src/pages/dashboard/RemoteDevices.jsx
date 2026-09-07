import { useEffect, useState, useMemo } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { copyToClipboard } from '../../utils';

// Remote Devices — SDK supervisor snippet + devices table with search + pagination
export default function RemoteDevices() {
  const toast = useToast();
  const [devices, setDevices] = useState([]);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    api('/manage/devices').then(setDevices).catch(() => {});
  }, []);

  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) =>
      (d.peer || '').toLowerCase().includes(q) ||
      String(d.tunnels || '').includes(q) ||
      String(d.requests || '').includes(q) ||
      (d.last_token || '').toLowerCase().includes(q)
    );
  }, [devices, search]);

  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedDevices = filteredDevices.slice(startIndex, endIndex);

  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <>
      <h2 style={{ marginBottom: '.4rem' }}>Remote Devices</h2>
      <p className="dim" style={{ marginBottom: '1.2rem', fontSize: '.9rem' }}>Machines that have connected tunnels — always-on status at a glance. Keep a device online with the SDK supervisor:</p>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-body">
          <div className="cmd-box cmd-box-relative">
            <pre>{`from sdk.pinggy_sdk import TunnelClient
client = TunnelClient("${window.location.origin}", api_key="pk_YOUR_KEY")
client.watch("YOUR_TOKEN", ports=[3000, 8000])   # auto-reconnects forever`}</pre>
            <button
              className="btn btn-sm copy-btn"
              onClick={() => {
                copyToClipboard(`from sdk.pinggy_sdk import TunnelClient\nclient = TunnelClient("${window.location.origin}", api_key="pk_YOUR_KEY")\nclient.watch("YOUR_TOKEN", ports=[3000, 8000])`);
                toast('Copied');
              }}
            >📋 Copy</button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.75rem' }}>
          <div>
            <div className="section-label">Connected machines</div>
            <h2 style={{ marginTop: '.15rem' }}>Your devices <span className="token-meta">({filteredDevices.length})</span></h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search IP, tunnels, requests, token..."
              style={{ minWidth: 220 }}
            />
            <button className="btn btn-sm btn-ghost" onClick={() => { api('/manage/devices').then(setDevices).catch(() => {}); }}>🔄 Refresh</button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {filteredDevices.length === 0 ? (
            <p className="empty">{devices.length === 0 ? 'No devices yet — connect a tunnel from any machine and it appears here.' : 'No devices match your search.'}</p>
          ) : (
            <table style={{ fontSize: '.85rem' }}>
              <thead><tr><th>Device IP</th><th>Status</th><th>Tunnels</th><th>Requests</th><th>Last seen</th><th></th></tr></thead>
              <tbody>
                {paginatedDevices.map((d) => (
                  <tr key={d.peer}>
                    <td><span className="code">{d.peer}</span></td>
                    <td>{d.online ? <span className="badge badge-green">● online</span> : <span className="badge">○ offline</span>}</td>
                    <td>{d.tunnels}</td>
                    <td>{d.requests}</td>
                    <td className="dim">{d.last_seen ? new Date(d.last_seen).toLocaleString() : '—'}</td>
                    <td>
                      {d.last_token && (
                        <button className="btn btn-sm" title="Copy reconnect token" onClick={() => { copyToClipboard(d.last_token); toast('Token copied'); }}>📋 Token</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {filteredDevices.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-soft)',
            borderRadius: '0 0 8px 8px',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}>
            <div style={{
              fontSize: '.85rem',
              color: 'var(--text-dim)',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              height: '32px'
            }}>
              Showing {startIndex + 1}-{Math.min(endIndex, filteredDevices.length)} of {filteredDevices.length} devices
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'nowrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>Rows:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
                  style={{
                    fontSize: '.8rem',
                    padding: '0.35rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    height: '32px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    opacity: currentPage === 1 ? 0.5 : 1,
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    padding: '0.4rem 0.75rem',
                    height: '32px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: 0,
                    border: 'none',
                    borderRight: '1px solid var(--border)',
                    background: 'transparent'
                  }}
                >
                  ← Prev
                </button>
                <span style={{
                  fontSize: '.85rem',
                  fontWeight: 600,
                  padding: '0.4rem 0.75rem',
                  height: '32px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'var(--text)',
                  background: 'var(--bg)',
                  borderRight: '1px solid var(--border)',
                  boxSizing: 'border-box',
                  whiteSpace: 'nowrap'
                }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    opacity: currentPage === totalPages ? 0.5 : 1,
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    padding: '0.4rem 0.75rem',
                    height: '32px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: 0,
                    border: 'none',
                    background: 'transparent'
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}