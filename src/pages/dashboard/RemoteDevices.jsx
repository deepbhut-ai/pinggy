import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { copyToClipboard } from '../../utils';
import { useTableData, SearchBar, Pagination } from '../../components/TableControls';

// Remote Devices — SDK supervisor snippet + devices table
export default function RemoteDevices() {
  const toast = useToast();
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    api('/manage/devices').then(setDevices).catch(() => {});
  }, []);

  const table = useTableData(devices, { searchKeys: ['peer'], pageSize: 10 });

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
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
          <h2>Connected Devices</h2>
          <SearchBar value={table.search} onChange={(v) => { table.setSearch(v); table.setPage(1); }} placeholder="Search device IP…" style={{ maxWidth: 280 }} />
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {devices.length === 0 ? (
            <p className="empty">No devices yet — connect a tunnel from any machine and it appears here.</p>
          ) : table.filtered.length === 0 ? (
            <p className="empty">No devices match your search.</p>
          ) : (
            <>
            <table style={{ fontSize: '.85rem' }}>
              <thead><tr><th>Device IP</th><th>Status</th><th>Tunnels</th><th>Requests</th><th>Last seen</th><th></th></tr></thead>
              <tbody>
                {table.paged.map((d) => (
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
            <Pagination page={table.page} totalPages={table.totalPages} setPage={table.setPage} total={table.total} pageSize={table.pageSize} />
            </>
          )}
        </div>
      </div>
    </>
  );
}