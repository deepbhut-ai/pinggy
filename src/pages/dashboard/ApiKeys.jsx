import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { copyToClipboard } from '../../utils';
import { useTableData, SearchBar, Pagination } from '../../components/TableControls';
import { Link } from 'react-router-dom';

function isRootDomain(domain) {
  if (!domain) return false;
  const labels = domain.replace(/^https?:\/\//, '').split('.').filter(Boolean);
  return labels.length <= 2;
}

export default function ApiKeys() {
  const { user } = useAuth();
  const toast = useToast();
  const [keys, setKeys] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('CI pipeline');
  const [expiry, setExpiry] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [keyFilter, setKeyFilter] = useState(''); // dropdown filter by API key name

  const load = useCallback(() => {
    api('/apikeys').then(setKeys).catch(() => {});
    api('/tokens').then(setTokens).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // Count domains vs subdomains per API key (only tokens created by that key)
  const domainCountByKey = useMemo(() => {
    const counts = {}; // { apiKeyId: { domains, subdomains } }
    tokens.forEach((t) => {
      if (!t.created_by_api_key) return; // skip tokens not created via API key
      if (!counts[t.created_by_api_key]) counts[t.created_by_api_key] = { domains: 0, subdomains: 0 };
      const c = counts[t.created_by_api_key];
      if (t.custom_domain) {
        if (isRootDomain(t.custom_domain)) c.domains++;
        else c.subdomains++;
      }
      (t.domains || []).forEach((d) => {
        if (isRootDomain(d)) c.domains++;
        else c.subdomains++;
      });
    });
    return counts;
  }, [tokens]);

  // Unique API key names for the dropdown filter
  const keyNames = useMemo(() => {
    const names = [...new Set(keys.map((k) => k.name))];
    return names.sort();
  }, [keys]);

  const filteredKeys = useMemo(() => {
    if (!keyFilter) return keys;
    return keys.filter((k) => k.name === keyFilter);
  }, [keys, keyFilter]);

  const table = useTableData(filteredKeys, { searchKeys: ['name', 'prefix'], pageSize: 10 });

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
    <>
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

      {atCap && (
        <div className="card" style={{ borderColor: 'var(--red)', marginBottom: '1rem' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '.8rem 1rem' }}>
            <span style={{ fontSize: '.85rem' }}>⚠️ You've reached the <strong>{limit}-key limit</strong> of the {user?.plan} plan. Revoke a key you no longer use, or upgrade for 10.</span>
          </div>
        </div>
      )}

      {/* How to connect guide */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>🔌 How to connect & use your API key</h2></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
            <div>
              <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.3rem' }}><span style={{ color: 'var(--brand)' }}>Step 1.</span> Create a key — click "+ Create API Key" above. The full key (starts with <span className="code">pk_</span>) is shown <strong>only once</strong>.</div>
            </div>
            <div>
              <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.3rem' }}><span style={{ color: 'var(--brand)' }}>Step 2.</span> Send the key as a header on every request:</div>
              <div className="cmd-box"><pre>X-Api-Key: pk_your_key_here</pre></div>
            </div>
            <div>
              <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.3rem' }}><span style={{ color: 'var(--brand)' }}>Step 3.</span> Call any endpoint under <span className="code">{origin}/api/v1</span> — test with curl:</div>
              <div className="cmd-box cmd-box-relative">
                <pre>curl -H "X-Api-Key: pk_your_key" {origin}/api/v1/manage/tunnels</pre>
                <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(`curl -H "X-Api-Key: pk_your_key" ${origin}/api/v1/manage/tunnels`); toast('Copied'); }}>📋 Copy</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keys table */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
          <h2>API Keys</h2>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={keyFilter} onChange={(e) => { setKeyFilter(e.target.value); table.setPage(1); }} style={{ width: 'auto', maxWidth: 180, fontSize: '.82rem' }}>
              <option value="">All API Keys</option>
              {keyNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <SearchBar value={table.search} onChange={(v) => { table.setSearch(v); table.setPage(1); }} placeholder="Search name, key…" style={{ maxWidth: 280 }} />
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {keys.length === 0 ? (
            <p className="empty">No API keys yet</p>
          ) : table.filtered.length === 0 ? (
            <p className="empty">No keys match your search.</p>
          ) : (
            <>
            <table>
              <thead><tr><th>Name</th><th>Key</th><th>Domains</th><th>Subdomains</th><th>Created</th><th>Expires</th><th>Last used</th><th>Actions</th></tr></thead>
              <tbody>
                {table.paged.map((k) => {
                  const expired = k.expires_at && new Date(k.expires_at) < new Date();
                  return (
                    <tr key={k.id}>
                      <td>{k.name}</td>
                      <td className="code">{k.prefix}…</td>
                      <td><span className="badge badge-green">{(domainCountByKey[k.id] || {domains: 0}).domains}</span></td>
                      <td><span className="badge badge-blue">{(domainCountByKey[k.id] || {subdomains: 0}).subdomains}</span></td>
                      <td>{k.created_at ? k.created_at.substring(0, 10) : '—'}</td>
                      <td>
                        {!k.expires_at
                          ? <span className="dim">never</span>
                          : expired
                            ? <span className="badge badge-red">expired</span>
                            : <span className="dim">{k.expires_at.substring(0, 10)}</span>}
                      </td>
                      <td>{k.last_used_at ? k.last_used_at.replace('T', ' ').substring(0, 16) : 'never'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '.3rem' }}>
                          <Link to="/dashboard/tokens" title="View tokens" style={{ display: 'inline-flex', alignItems: 'center', padding: '.2rem .4rem', borderRadius: 'var(--radius)', background: 'var(--surface-1)', color: 'var(--brand)', textDecoration: 'none', fontSize: '.85rem' }}>👁️</Link>
                          <button className="btn btn-sm btn-danger" onClick={() => revoke(k)}>Revoke</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={table.page} totalPages={table.totalPages} setPage={table.setPage} total={table.total} pageSize={table.pageSize} />
            </>
          )}
        </div>
      </div>

      {/* SDK quick start */}
      <div className="card" style={{ marginTop: '1rem' }}>
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
    </>
  );
}