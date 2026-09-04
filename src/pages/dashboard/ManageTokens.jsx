import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { copyToClipboard, formatBytes } from '../../utils';

export default function ManageTokens() {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [selected, setSelected] = useState(null); // full token object for guide
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDomain, setCreateDomain] = useState('');
  const [createSub, setCreateSub] = useState('');
  const [editOpen, setEditOpen] = useState(null); // token
  const [editState, setEditState] = useState({});
  const [regenOpen, setRegenOpen] = useState(null);
  const [delOpen, setDelOpen] = useState(null);

  const load = useCallback(async () => {
    try {
      const [infoD, tokensD] = await Promise.all([
        api('/tunnels/info').catch(() => ({})),
        api('/tokens'),
      ]);
      setInfo(infoD);
      setTokens(tokensD);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const sshPort = info?.ssh_port || 2222;

  const create = async () => {
    const name = createName.trim() || 'New Token';
    try {
      const payload = { name };
      const d = createDomain.trim().toLowerCase();
      const sub = createSub.trim().toLowerCase();
      if (d) payload.custom_domain = d;
      if (sub) payload.fixed_subdomain = sub;
      const result = await api('/tokens', 'POST', payload);
      toast('Token created: ' + result.token + (sub ? ` · subdomain: ${sub}.iraglobaltech.com` : '') + (d ? ` · domain: ${d}` : ''));
      setCreateOpen(false);
      load();
    } catch (e) {
      if (e.message.toLowerCase().includes('free plan') || e.message.toLowerCase().includes('upgrade')) {
        toast('Free plan allows only 1 tunnel. Upgrade to Pro for more.', 'error');
      } else { toast(e.message, 'error'); }
    }
  };

  const openEdit = async (t) => {
    setEditOpen(t);
    const sec = t.security || {};
    setEditState({
      name: t.name || '',
      domain: t.custom_domain || '',
      fixedSub: t.fixed_subdomain || '',
      tunnelMode: t.tunnel_mode || 'http',
      tcpPort: '',
      basicUser: sec.basic_auth_user || '',
      basicPass: '',
      ipWhitelist: sec.ip_whitelist || '',
      bearerKey: '',
      httpsOnly: !!sec.https_only,
    });
  };

  const saveEdit = async () => {
    const t = editOpen;
    const s = editState;
    const payload = { name: s.name.trim(), custom_domain: s.domain.trim() };
    if (s.fixedSub !== (t.fixed_subdomain || '')) payload.fixed_subdomain = s.fixedSub.trim().toLowerCase();
    if (s.tunnelMode === 'tcp') {
      payload.tunnel_mode = 'tcp';
      if (s.tcpPort) payload.tcp_port = parseInt(s.tcpPort);
    } else payload.tunnel_mode = 'http';
    if (s.basicUser || s.basicPass) {
      payload.basic_auth_user = s.basicUser;
      if (s.basicPass) payload.basic_auth_pass = s.basicPass;
    }
    if (s.ipWhitelist !== ((t.security || {}).ip_whitelist || '')) payload.ip_whitelist = s.ipWhitelist;
    if (s.bearerKey) payload.bearer_key = s.bearerKey;
    if (s.httpsOnly !== !!((t.security || {}).https_only)) payload.https_only = s.httpsOnly;
    try {
      await api(`/tokens/${t.id}`, 'PUT', payload);
      toast('Token updated');
      setEditOpen(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const regen = async () => {
    try {
      const result = await api(`/tokens/${regenOpen.id}/regenerate`, 'POST');
      toast('Token regenerated: ' + result.token);
      setRegenOpen(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const del = async () => {
    const tokenToDelete = delOpen;
    if (!tokenToDelete) return;
    try {
      await api(`/tokens/${tokenToDelete.id}`, 'DELETE');
      toast('Token deleted');
      setDelOpen(null);
      if (selected?.id === tokenToDelete.id) setSelected(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  // The Domain page stores user-added domains on the user's own tokens.
  // Team tokens and generated/fixed subdomains must never appear here.
  const userDomains = Array.from(
    new Set(
      tokens
        .filter((t) => !t.via_team)
        .flatMap((t) => [t.custom_domain, ...(t.domains || [])])
        .map((d) => (d ? String(d).trim().toLowerCase() : ''))
        .filter((d) => {
          if (!d) return false;
          if (d.endsWith('iraglobaltech.com') || d === 'iraglobaltech.com') return false;
          if (tokens.some((tk) => tk.subdomain === d || tk.fixed_subdomain === d)) return false;
          return true;
        })
    )
  );

  const availableDomains = [
    ...userDomains,
    ...(createDomain &&
    !createDomain.trim().toLowerCase().endsWith('iraglobaltech.com') &&
    createDomain.trim().toLowerCase() !== 'iraglobaltech.com' &&
    !tokens.some((tk) => tk.subdomain === createDomain.trim().toLowerCase() || tk.fixed_subdomain === createDomain.trim().toLowerCase()) &&
    !userDomains.includes(createDomain.trim().toLowerCase())
      ? [createDomain.trim().toLowerCase()]
      : []),
  ];

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Manage Tokens</div>
          <div className="page-subtitle">Create separate credentials for each tunnel or project.</div>
        </div>
        <div className="page-toolbar-actions">
          <button className="btn" onClick={() => { setCreateName(''); setCreateDomain(''); setCreateSub(''); setCreateOpen(true); }}>+ Subdomain Token</button>
        </div>
      </div>

      {info && info.seats != null && (
        <div className="card" style={{ marginBottom: '1rem', padding: '.75rem 1rem', display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <span style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>Domain seats:</span>
            <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{info.domain_tokens_used ?? 0} / {info.seats}</span>
            {info.plan === 'pro' && (
              <span style={{ fontSize: '.7rem', color: 'var(--green)', fontWeight: 600 }}>
                ({info.seats - (info.domain_tokens_used ?? 0)} remaining)
              </span>
            )}
          </div>
          {info.plan === 'pro' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <span style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>Subdomain tokens:</span>
              <span style={{ fontWeight: 700, color: 'var(--green)' }}>Unlimited</span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-dim)' }}>({info.subdomain_tokens_used ?? 0} in use)</span>
            </div>
          )}
          {info.plan !== 'pro' && (
            <div style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>
              Upgrade to Pro for unlimited subdomain tokens and more domain seats.
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div>
            <div className="section-label">Credentials</div>
            <h2 style={{ marginTop: '.15rem' }}>Your tokens <span className="token-meta">({tokens.length})</span></h2>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={load}>🔄 Refresh</button>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {tokens.length === 0 ? (
            <p className="empty">No tokens yet. Click "Subdomain Token" to create one.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Token</th><th>Name</th><th>Subdomain</th><th>Type</th>
                  <th>Security</th><th>Custom Domain</th><th>Requests</th><th>Data</th>
                  <th>Active</th><th>Created</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t, i) => {
                  const sec = t.security || {};
                  const teamRole = String(t.via_team?.my_role || '').toLowerCase();
                  const canDelete = !t.via_team || ['owner', 'admin', 'team_owner', 'team_admin'].includes(teamRole);
                  const badges = [];
                  if (sec.basic_auth_user) badges.push(<span key="a" className="badge" title="Basic auth enabled">🔐</span>);
                  if (sec.ip_whitelist) badges.push(<span key="b" className="badge" title={'IP whitelist: ' + sec.ip_whitelist}>🌐</span>);
                  if (sec.bearer_key) badges.push(<span key="c" className="badge" title="API key required">🔑</span>);
                  if (sec.https_only) badges.push(<span key="d" className="badge" title="HTTPS only">🔒</span>);
                  const typeBadge = t.tunnel_mode === 'tcp'
                    ? <span className="badge badge-blue" title={'TCP tunnel on port ' + (t.tcp_port || '?')}>TCP{t.tcp_port ? ':' + t.tcp_port : ''}</span>
                    : <span className="badge" title="HTTP tunnel">HTTP</span>;
                  const teamBadge = t.via_team
                    ? <span className="badge badge-blue" title={`Shared via team '${t.via_team.team_name}' (my role: ${t.via_team.my_role || 'member'})`}>👥 {t.via_team.team_name}</span>
                    : (t.team_id ? <span className="badge" title="Shared with a team">👥</span> : null);
                  return (
                    <tr
                      key={t.id}
                      className={selected?.id === t.id ? 'row-selected' : ''}
                      style={{ cursor: 'pointer', transition: '.15s' }}
                      onClick={() => setSelected(selected?.id === t.id ? null : t)}
                    >
                      <td><span className="code dim" style={{ fontSize: '.72rem' }}>{t.id.substring(0, 8)}…</span></td>
                      <td>
                        <span className="token-value">
                          <strong className="code">{t.token.substring(0, 8)}••••••••</strong>{' '}
                          <button
                            className="icon-btn"
                            title="Copy token"
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(t.token); toast('Token copied'); }}
                          >📋</button>
                        </span>
                      </td>
                      <td>{t.name || '—'} {teamBadge}</td>
                      <td className="code">{t.subdomain}{t.fixed_subdomain ? ' 📌' : ''}</td>
                      <td>{typeBadge}</td>
                      <td>{badges.length ? badges : <span className="dim">—</span>}</td>
                      <td>{t.custom_domain ? <span className="badge badge-blue">{t.custom_domain}</span> : <span className="dim">—</span>}</td>
                      <td>{t.total_requests || 0}</td>
                      <td>{formatBytes(t.total_bytes || 0)}</td>
                      <td><span className={`badge ${t.active_tunnels > 0 ? 'badge-green' : ''}`}>{t.active_tunnels || 0}</span></td>
                      <td>{t.created_at ? t.created_at.substring(0, 10) : '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => openEdit(t)}>✏️</button>{' '}
                        <button className="btn btn-sm btn-ghost" title="Regenerate" onClick={() => setRegenOpen(t)}>🔄</button>{' '}
                        {canDelete && (
                          <button className="btn btn-sm btn-danger" title="Delete token" aria-label={`Delete ${t.name || 'token'}`} onClick={() => setDelOpen(t)}>🗑️</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Connection Guide panel */}
      {selected && (
        <TokenGuide
          token={selected}
          sshPort={sshPort}
          onClose={() => setSelected(null)}
          toast={toast}
        />
      )}

      {/* Create modal */}
      {createOpen && (
        <Modal title="Subdomain Token" confirmLabel="Create" onConfirm={create} onClose={() => setCreateOpen(false)}>
          {/* Token name */}
          <div className="form-group">
            <label>Token name</label>
            <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. My Website" />
          </div>

          {/* Domain */}
          <div className="form-group">
            <label>Domain</label>
            <select
              value={createDomain}
              onChange={(e) => setCreateDomain(e.target.value)}
            >
              <option value="">-- Select a domain (optional) --</option>
              {availableDomains.map((dom) => (
                <option key={dom} value={dom}>
                  {dom}
                </option>
              ))}
            </select>
            {availableDomains.length === 0 && (
              <div className="dim" style={{ fontSize: '.75rem', marginTop: '.3rem' }}>
                No custom domains added yet. You can add one in the Domains section.
              </div>
            )}
          </div>

          {/* Subdomain */}
          <div className="form-group">
            <label>Subdomain</label>
            <input type="text" value={createSub} onChange={(e) => setCreateSub(e.target.value)} placeholder="e.g. myapp" />
            {createSub.trim() && (
              <div className="inline-note" style={{ marginTop: '.35rem', padding: '.4rem .6rem', fontSize: '.78rem' }}>
                <span>🔗 <span className="code" style={{ color: 'var(--brand)', fontWeight: 600 }}>{createSub.trim().toLowerCase()}.iraglobaltech.com</span></span>
              </div>
            )}
          </div>
          <p className="dim" style={{ fontSize: '.75rem', marginTop: '.25rem' }}>Both subdomain and domain are optional — select a domain or enter a subdomain (or both).</p>
        </Modal>
      )}

      {/* Edit modal */}
      {editOpen && (
        <Modal title="Edit Token" confirmLabel="Save" onConfirm={saveEdit} onClose={() => setEditOpen(null)}>
          <div className="form-group">
            <label>Token name</label>
            <input type="text" value={editState.name} onChange={(e) => setEditState({ ...editState, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Custom domain (leave empty for none)</label>
            <input type="text" value={editState.domain} onChange={(e) => setEditState({ ...editState, domain: e.target.value })} placeholder="e.g. serverira.com" />
          </div>
          <div className="form-group">
            <label>Fixed subdomain — your permanent URL (empty = random each connect)</label>
            <input type="text" value={editState.fixedSub} onChange={(e) => setEditState({ ...editState, fixedSub: e.target.value })} placeholder="myapi" />
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '.6rem' }}>
            <div className="form-group">
              <label>Tunnel type</label>
              <select value={editState.tunnelMode} onChange={(e) => setEditState({ ...editState, tunnelMode: e.target.value })}>
                <option value="http">HTTP</option>
                <option value="tcp">TCP (Pro)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Persistent TCP port (Pro — the public port stays yours)</label>
              <input type="number" min="1024" max="65535" value={editState.tcpPort} onChange={(e) => setEditState({ ...editState, tcpPort: e.target.value })} placeholder="e.g. 15000" />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', margin: '.75rem 0', paddingTop: '.75rem' }}>
            <strong style={{ fontSize: '.85rem' }}>🔒 Security</strong>
            <div className="form-group" style={{ marginTop: '.5rem' }}>
              <label>Basic auth — username:password (empty = off)</label>
              <input type="text" value={editState.basicUser} onChange={(e) => setEditState({ ...editState, basicUser: e.target.value })} placeholder="admin" style={{ marginBottom: '.3rem' }} />
              <input type="password" value={editState.basicPass} onChange={(e) => setEditState({ ...editState, basicPass: e.target.value })} placeholder={editState.basicUser ? '(unchanged — type to change)' : 'password'} />
            </div>
            <div className="form-group">
              <label>IP whitelist (comma-separated IPs/CIDRs, empty = allow all)</label>
              <input type="text" value={editState.ipWhitelist} onChange={(e) => setEditState({ ...editState, ipWhitelist: e.target.value })} placeholder="203.0.113.5, 10.0.0.0/8" />
            </div>
            <div className="form-group">
              <label>API key required on requests (empty = off, "auto" = generate)</label>
              <input type="text" value={editState.bearerKey} onChange={(e) => setEditState({ ...editState, bearerKey: e.target.value })} placeholder={editOpen.security?.bearer_key ? '(key set — hidden)' : 'auto'} />
            </div>
            <label className="checkbox-label">
              <input type="checkbox" checked={editState.httpsOnly} onChange={(e) => setEditState({ ...editState, httpsOnly: e.target.checked })} />
              HTTPS only (reject plain HTTP requests)
            </label>
          </div>
        </Modal>
      )}

      {/* Regenerate modal */}
      {regenOpen && (
        <Modal title="Regenerate Token" confirmLabel="Regenerate" onConfirm={regen} onClose={() => setRegenOpen(null)}>
          <p className="dim" style={{ fontSize: '.875rem', lineHeight: 1.5 }}>
            Are you sure? The old token will stop working immediately. Any active tunnels using it will be disconnected.
          </p>
        </Modal>
      )}

      {/* Delete modal */}
      {delOpen && (
        <Modal title="Delete Token" confirmLabel="Delete permanently" onConfirm={del} onClose={() => setDelOpen(null)}>
          <p style={{ fontSize: '.9rem', lineHeight: 1.5 }}>
            Delete <strong>{delOpen.name || 'this token'}</strong>?
          </p>
          <p className="dim" style={{ fontSize: '.825rem', lineHeight: 1.5, marginTop: '.5rem' }}>
            The token will stop working immediately and any active tunnel using it will disconnect. This action cannot be undone.
          </p>
          <div className="cmd-box" style={{ marginTop: '.75rem' }}>
            <span className="code">{delOpen.token.substring(0, 8)}••••••••</span>
          </div>
        </Modal>
      )}

    </>
  );
}

// ---- Connection Guide panel (legacy selectToken) ----
function TokenGuide({ token: t, sshPort, onClose, toast }) {
  const [os, setOs] = useState('windows');
  const [autoReconnect, setAutoReconnect] = useState(false);
  const [port, setPort] = useState(8080);

  const tunnelUrl = t.custom_domain ? `https://${t.custom_domain}` : `https://${t.subdomain}.iraglobaltech.com`;
  const ssh = `ssh -p ${sshPort} -R0:127.0.0.1:${port} -o StrictHostKeyChecking=no -o ServerAliveInterval=30 ${t.token}@ssh.iraglobaltech.com`;
  let cmd = ssh;
  if (autoReconnect) {
    cmd = os === 'windows'
      ? `while ($true) { ${ssh}; Write-Host "Disconnected. Reconnecting in 5 seconds..."; Start-Sleep -Seconds 5 }`
      : `while true; do\n  ${ssh}\n  echo "Disconnected. Reconnecting in 5 seconds..."\n  sleep 5\ndone`;
  }

  const hints = {
    windows: <>Open <strong>PowerShell</strong> and paste the command above.</>,
    linux: <>Open your <strong>terminal</strong> (Ctrl+Alt+T) and paste the command above.</>,
    mac: <>Open <strong>Terminal</strong> (Cmd+Space → "Terminal") and paste the command above.</>,
  };

  return (
    <div className="card" style={{ border: '1px solid var(--brand)', marginTop: '1rem' }}>
      <div className="card-header" style={{ background: 'var(--brand-light)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '1rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🔌</span> {t.name || 'Token'} — Connection Guide
        </h2>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>✕ Close</button>
      </div>
      <div className="card-body" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="guide-box">
            <div className="guide-box-label">Access Token</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <code style={{ fontSize: '.875rem', fontWeight: 700, color: 'var(--brand)' }}>{t.token}</code>
              <button className="btn btn-sm" style={{ padding: '.2rem .5rem', fontSize: '.75rem' }} onClick={() => { copyToClipboard(t.token); toast('Token copied'); }}>📋 Copy</button>
            </div>
          </div>
          <div className="guide-box">
            <div className="guide-box-label">Tunnel URL</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <a href={tunnelUrl} target="_blank" rel="noreferrer" style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--brand)', wordBreak: 'break-all' }}>{tunnelUrl}</a>
              <button className="btn btn-sm" style={{ padding: '.2rem .5rem', fontSize: '.75rem' }} onClick={() => { copyToClipboard(tunnelUrl); toast('URL copied'); }}>📋</button>
            </div>
          </div>
        </div>

        {/* Step 1: OS */}
        <div className="guide-step">
          <div className="step-num">1</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.875rem', fontWeight: 600, marginBottom: '.5rem' }}>Choose your OS</div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              {[['windows', '🪟 Windows'], ['linux', '🐧 Linux'], ['mac', '🍎 Mac']].map(([key, label]) => (
                <button key={key} className={`os-tab ${os === key ? 'active' : ''}`} onClick={() => setOs(key)}>{label}</button>
              ))}
            </div>
            <label className="checkbox-label" style={{ marginTop: '.75rem' }}>
              <input type="checkbox" checked={autoReconnect} onChange={(e) => setAutoReconnect(e.target.checked)} />
              Automatically reconnect if the server or network disconnects
            </label>
          </div>
        </div>

        {/* Step 2: port */}
        <div className="guide-step">
          <div className="step-num">2</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.875rem', fontWeight: 600, marginBottom: '.5rem' }}>Enter your local port</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
              <input type="number" value={port} min="1" max="65535" onChange={(e) => setPort(parseInt(e.target.value) || 8080)} style={{ width: 100 }} />
              <span className="dim" style={{ fontSize: '.8rem' }}>The port your local service runs on (e.g. 8080, 3000, 8000)</span>
            </div>
          </div>
        </div>

        {/* Step 3: command */}
        <div className="guide-step">
          <div className="step-num">3</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.875rem', fontWeight: 600, marginBottom: '.5rem' }}>
              Run this {os === 'windows' ? 'PowerShell' : 'Terminal'} command
            </div>
            <div className="cmd-box cmd-box-relative">
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '.85rem' }}>{cmd}</pre>
              <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(cmd); toast('Command copied'); }}>📋 Copy</button>
            </div>
            {os === 'windows' && (
              <div style={{ marginTop: '.75rem' }}>
                <div className="dim" style={{ fontSize: '.75rem', fontWeight: 600, marginBottom: '.35rem' }}>Windows Command Prompt (one-time connection)</div>
                <div className="cmd-box cmd-box-relative">
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '.85rem' }}>{ssh}</pre>
                  <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(ssh); toast('Command copied'); }}>📋 Copy</button>
                </div>
              </div>
            )}
            <div className="dim" style={{ marginTop: '.5rem', fontSize: '.825rem', lineHeight: 1.5 }}>{hints[os]}</div>
          </div>
        </div>

        {/* Step 4: access */}
        <div className="guide-step">
          <div className="step-num step-num-green">4</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.875rem', fontWeight: 600, marginBottom: '.5rem' }}>Access your tunnel</div>
            <div className="guide-success">
              <span style={{ fontSize: '1.25rem' }}>🌐</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="dim" style={{ fontSize: '.75rem', marginBottom: '.15rem' }}>Your tunnel will be available at:</div>
                <a href={tunnelUrl} target="_blank" rel="noreferrer" style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--green)', wordBreak: 'break-all' }}>{tunnelUrl}</a>
              </div>
              <button className="btn btn-sm" style={{ padding: '.3rem .6rem', fontSize: '.75rem' }} onClick={() => { copyToClipboard(tunnelUrl); toast('URL copied'); }}>📋</button>
            </div>
          </div>
        </div>

        <div className="guide-tips">
          <strong>💡 Tips:</strong><br />
          • Keep the terminal window open while you need the tunnel — closing it disconnects the tunnel.<br />
          • The <code>-R0:</code> flag auto-assigns a remote port. Your tunnel URL stays the same.<br />
          • <code>ServerAliveInterval=30</code> keeps the connection alive with periodic keep-alive packets.<br />
          {t.custom_domain
            ? '• Visitors to your custom domain will be routed through this tunnel.'
            : <>• Your subdomain <code>{t.subdomain}</code> is fixed for this token — it will not change between connections.</>}
        </div>
      </div>
    </div>
  );
}
