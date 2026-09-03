import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { copyToClipboard } from '../../utils';

export default function ApiKeys() {
  const { user } = useAuth();
  const toast = useToast();
  const [keys, setKeys] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('CI pipeline');
  const [expiry, setExpiry] = useState('');
  const [createdKey, setCreatedKey] = useState(null);

  const load = useCallback(() => api('/apikeys').then(setKeys).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const limit = user?.plan === 'pro' ? 10 : 5;
  const atCap = keys.length >= limit;
  const origin = window.location.origin;

  const create = async () => {
    if (!newName.trim()) return toast('Give the key a name', 'error');
    try {
      const k = await api('/apikeys', 'POST', { name: newName.trim(), expiry_days: expiry ? parseInt(expiry) : null });
      setCreateOpen(false);
      setCreatedKey(k);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const revoke = async (k) => {
    if (!window.confirm(`Revoke API key "${k.name}"? Scripts using it will stop working immediately.`)) return;
    try {
      await api(`/apikeys/${k.id}`, 'DELETE');
      toast('API key revoked');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="api-keys-page">
      <div className="page-toolbar">
        <div>
          <div className="page-title">
            API Keys <span className="token-meta" style={{ fontSize: '.8rem', color: atCap ? 'var(--red)' : 'var(--text-dim)' }}>
              {keys.length} / {limit} used{user?.plan !== 'pro' ? ' · Pro gets 10' : ''}
            </span>
          </div>
          <div className="page-subtitle">Manage tunnels & tokens from scripts, CI, or the Python SDK.</div>
        </div>
        <div className="page-toolbar-actions">
          <button
            className="btn"
            disabled={atCap}
            title={atCap ? 'Key limit reached — revoke one or upgrade to Pro' : ''}
            onClick={() => setCreateOpen(true)}
          >+ Create API Key</button>
        </div>
      </div>

      <div className="api-keys-summary">
        <div>
          <span className="api-keys-kicker">Programmatic access</span>
          <h2>One key for every workflow</h2>
          <p>Create separate keys for CI, scripts, and integrations. Full secrets are shown only once.</p>
        </div>
        <div className="api-keys-meter">
          <span>Key capacity</span>
          <strong>{keys.length} <small>/ {limit}</small></strong>
          <div className="api-keys-meter-track"><i style={{ width: `${Math.min((keys.length / limit) * 100, 100)}%` }} /></div>
        </div>
      </div>

      {atCap && <div className="api-keys-alert">⚠️ You've reached the <strong>{limit}-key limit</strong> of the {user?.plan} plan. Revoke an unused key or upgrade to Pro.</div>}

      {/* How to connect guide */}
      <div className="card api-keys-guide" style={{ marginBottom: '1rem' }}>
        <div className="api-keys-guide-heading">
          <div>
            <span className="api-keys-kicker">Quick connection</span>
            <h2>🔌 How to connect & use your API key</h2>
            <p>Authenticate requests from your terminal, backend, or CI pipeline in three steps.</p>
          </div>
          <a className="btn btn-sm btn-ghost" href="/dashboard/apidocs">View API Docs →</a>
        </div>
        <div className="card-body">
          <div className="api-keys-guide-grid">
            <div className="api-keys-guide-step">
              <span className="api-keys-step-number">01</span>
              <div>
                <strong>Create a key</strong>
                <p>Click <span className="code">+ Create API Key</span>. Your full <span className="code">pk_</span> key appears once, so copy it immediately.</p>
              </div>
            </div>
            <div className="api-keys-guide-step">
              <span className="api-keys-step-number">02</span>
              <div>
                <strong>Send the key securely</strong>
                <p>Include it as the <span className="code">X-Api-Key</span> header on every management request.</p>
                <div className="cmd-box"><pre>X-Api-Key: pk_your_key_here</pre></div>
              </div>
            </div>
            <div className="api-keys-guide-step">
              <span className="api-keys-step-number">03</span>
              <div>
                <strong>Make your first request</strong>
                <p>Call an endpoint under <span className="code">{origin}/api/v1</span>. This lists your live tunnels:</p>
                <div className="cmd-box cmd-box-relative">
                  <pre>curl -H "X-Api-Key: pk_your_key" {origin}/api/v1/manage/tunnels</pre>
                  <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(`curl -H "X-Api-Key: pk_your_key" ${origin}/api/v1/manage/tunnels`); toast('Copied'); }}>📋 Copy</button>
                </div>
              </div>
            </div>
          </div>
          <div className="api-keys-guide-note">Tip: use one key per integration and set a short expiry for CI credentials.</div>
        </div>
      </div>

      {/* Keys table */}
      <div className="card api-keys-inventory">
        <div className="api-keys-inventory-header"><div><h2>Your API keys</h2><p>Active credentials and recent usage</p></div><span className="badge badge-green">{keys.length ? 'Ready' : 'No keys yet'}</span></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {keys.length === 0 ? (
            <p className="empty">No API keys yet</p>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Expires</th><th>Last used</th><th>Actions</th></tr></thead>
              <tbody>
                {keys.map((k) => {
                  const expired = k.expires_at && new Date(k.expires_at) < new Date();
                  return (
                    <tr key={k.id}>
                      <td>{k.name}</td>
                      <td className="code">{k.prefix}…</td>
                      <td>{k.created_at ? k.created_at.substring(0, 10) : '—'}</td>
                      <td>
                        {!k.expires_at
                          ? <span className="dim">never</span>
                          : expired
                            ? <span className="badge badge-red">expired</span>
                            : <span className="dim">{k.expires_at.substring(0, 10)}</span>}
                      </td>
                      <td>{k.last_used_at ? k.last_used_at.replace('T', ' ').substring(0, 16) : 'never'}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => revoke(k)}>Revoke</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* SDK quick start */}
      <div className="card api-keys-sdk" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2>Python SDK quick start</h2></div>
        <div className="card-body">
          <div className="cmd-box"><pre>{`from sdk.pinggy_sdk import TunnelClient

client = TunnelClient("${origin}", api_key="pk_YOUR_KEY")
print(client.tokens())            # list tokens
client.create_token(name="ci")   # make one from CI
client.stop_tunnel("mysub")      # stop a live tunnel`}</pre></div>
          <p className="dim" style={{ fontSize: '.78rem', marginTop: '.5rem' }}>Or plain HTTP: send <span className="code">X-Api-Key</span> to <span className="code">/api/v1/manage/tunnels</span>, <span className="code">/manage/tokens</span>, …</p>
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <Modal title="Create API Key" confirmLabel="Create" onConfirm={create} onClose={() => setCreateOpen(false)}>
          <div className="form-group">
            <label>Name</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. CI pipeline" autoFocus />
          </div>
          <div className="form-group">
            <label>Expires</label>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              <option value="">Never</option>
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
            </select>
            <p className="dim" style={{ fontSize: '.75rem', marginTop: '.3rem' }}>Tip: use a short expiry for CI keys you rotate often.</p>
          </div>
        </Modal>
      )}

      {/* One-time key modal */}
      {createdKey && (
        <Modal title="API Key Created — copy it now" confirmLabel="Done" onConfirm={() => { setCreatedKey(null); load(); }} onClose={() => { setCreatedKey(null); load(); }}>
          <p style={{ fontSize: '.8rem', color: 'var(--red)', fontWeight: 600 }}>This key is shown only once. Copy it now.</p>
          <div className="cmd-box cmd-box-relative" style={{ marginTop: '.5rem' }}>
            <pre>{createdKey.key}</pre>
            <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(createdKey.key); toast('Key copied'); }}>📋 Copy Key</button>
          </div>
          <p style={{ fontSize: '.78rem', marginTop: '1rem', fontWeight: 600 }}>✅ Test it right now — paste this in a terminal:</p>
          <div className="cmd-box cmd-box-relative" style={{ marginTop: '.4rem' }}>
            <pre>curl -H "X-Api-Key: {createdKey.key}" {origin}/api/v1/manage/tunnels</pre>
            <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(`curl -H "X-Api-Key: ${createdKey.key}" ${origin}/api/v1/manage/tunnels`); toast('Copied'); }}>📋 Copy</button>
          </div>
          <p className="dim" style={{ fontSize: '.75rem', marginTop: '.8rem' }}>Returns your live tunnels as JSON → the key works.</p>
        </Modal>
      )}
    </div>
  );
}