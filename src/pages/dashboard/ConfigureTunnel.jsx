import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, getToken } from '../../api/client';
import { useToast } from '../../components/Toast';
import { copyToClipboard } from '../../utils';
import { SearchBar } from '../../components/TableControls';

const PLATFORM_HINTS = {
  windows: 'Open Command Prompt (CMD) and paste the following command:',
  linux: 'Open terminal and paste the following command:',
  mac: 'Open Terminal and paste the following command:',
};

function getRootDomain(domain) {
  if (!domain) return '';
  const cleaned = domain.replace(/^https?:\/\//, '').toLowerCase().trim();
  const parts = cleaned.split('.').filter(Boolean);
  if (parts.length <= 2) return cleaned;
  return parts.slice(-2).join('.');
}

export default function ConfigureTunnel() {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [tokens, setTokens] = useState([]);

  const [platform, setPlatform] = useState('windows');
  const [tokenSel, setTokenSel] = useState('');
  const [multiPort, setMultiPort] = useState(true);
  const [multiPorts, setMultiPorts] = useState([]);
  const [cmdTab, setCmdTab] = useState('cli');
  const [keepAlive, setKeepAlive] = useState(true);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [strictHost, setStrictHost] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [qr, setQr] = useState(null);
  const [tokenSearch, setTokenSearch] = useState('');
  const [subdomainSearch, setSubdomainSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'enabled' | 'paused'

  // Group all tokens by their main root domain
  const mainDomains = useMemo(() => {
    const rootMap = new Map();

    tokens.forEach((t) => {
      const dom = t.custom_domain || (t.subdomain ? `${t.subdomain}.iraglobaltech.com` : null);
      if (!dom) return;
      const root = getRootDomain(dom);
      if (!root) return;

      if (!rootMap.has(root)) {
        rootMap.set(root, {
          rootDomain: root,
          primaryToken: t.token,
          tokenObj: t,
          items: [],
        });
      }

      const entry = rootMap.get(root);
      if (dom.toLowerCase() === root.toLowerCase()) {
        entry.primaryToken = t.token;
        entry.tokenObj = t;
      }

      const addrList = [];
      if (t.custom_domain) addrList.push(t.custom_domain);
      else if (t.subdomain) addrList.push(`${t.subdomain}.iraglobaltech.com`);
      (t.domains || []).forEach((d) => addrList.push(d));

      addrList.forEach((addr) => {
        if (!entry.items.some((item) => item.addr.toLowerCase() === addr.toLowerCase())) {
          entry.items.push({
            addr,
            label: addr.toLowerCase() === root.toLowerCase() ? '🌐 Root Domain' : '🔗 Subdomain',
            token: t.token,
            local_port: t.local_port,
          });
        }
      });
    });

    tokens.forEach((t) => {
      if (!t.custom_domain && !t.subdomain) {
        const key = t.name || `Token ${t.token.substring(0, 8)}`;
        if (!rootMap.has(key)) {
          rootMap.set(key, {
            rootDomain: key,
            primaryToken: t.token,
            tokenObj: t,
            items: [],
          });
        }
      }
    });

    return Array.from(rootMap.values());
  }, [tokens]);

  const load = useCallback(async () => {
    try {
      const [infoD, tokensD] = await Promise.all([
        api('/tunnels/info'),
        api('/tokens'),
      ]);
      setInfo(infoD);
      setTokens(tokensD);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => {
    load();
    const ua = navigator.userAgent;
    const detected = /Mac|iPhone|iPad|iPod/i.test(ua) ? 'mac' : /Win/i.test(ua) ? 'windows' : 'linux';
    setPlatform(detected);
  }, [load]);

  // Default selection to first main domain token on load
  useEffect(() => {
    if (mainDomains.length && !tokenSel) {
      setTokenSel(mainDomains[0].primaryToken);
    }
  }, [mainDomains, tokenSel]);

  const selectedGroup = useMemo(() => {
    return mainDomains.find((g) => g.primaryToken === tokenSel || g.items.some((i) => i.token === tokenSel)) || mainDomains[0];
  }, [mainDomains, tokenSel]);

  const selToken = selectedGroup?.tokenObj || tokens.find((t) => t.token === tokenSel) || tokens[0];

  const filteredMainDomains = useMemo(() => {
    if (!tokenSearch.trim()) return mainDomains;
    const q = tokenSearch.trim().toLowerCase();
    return mainDomains.filter((g) =>
      g.rootDomain.toLowerCase().includes(q) ||
      g.items.some((i) => i.addr.toLowerCase().includes(q))
    );
  }, [mainDomains, tokenSearch]);

  // Load saved multi-port config from backend
  const loadMultiPortConfig = useCallback(async (token) => {
    if (!token) return { multi_port_enabled: true, ports: {} };
    try {
      return await api(`/configs/multiport/${encodeURIComponent(token)}`);
    } catch { return { multi_port_enabled: true, ports: {} }; }
  }, []);

  // Save multi-port config to backend (debounced)
  const saveMultiPortConfig = useCallback(async (token, mpEnabled, ports) => {
    if (!token) return;
    try {
      const portsMap = {};
      ports.forEach((p) => {
        portsMap[p.addr] = { enabled: p.enabled !== false, port: p.port || '' };
      });
      await api('/configs/multiport', 'PUT', {
        token,
        multi_port_enabled: mpEnabled,
        ports: portsMap,
      });
    } catch { /* silent */ }
  }, []);

  const totalCount = multiPorts.length;
  const enabledCount = useMemo(() => multiPorts.filter((m) => m.enabled !== false).length, [multiPorts]);
  const pausedCount = totalCount - enabledCount;

  const filteredMultiPorts = useMemo(() => {
    let list = multiPorts;
    if (statusFilter === 'enabled') {
      list = list.filter((m) => m.enabled !== false);
    } else if (statusFilter === 'paused') {
      list = list.filter((m) => m.enabled === false);
    }
    if (!subdomainSearch.trim()) return list;
    const q = subdomainSearch.trim().toLowerCase();
    return list.filter((m) =>
      m.addr.toLowerCase().includes(q) ||
      (m.port && m.port.toString().includes(q)) ||
      (m.label && m.label.toLowerCase().includes(q))
    );
  }, [multiPorts, statusFilter, subdomainSearch]);

  const updatePortForAddr = (addr, newPort) => {
    const next = multiPorts.map((m) => (m.addr === addr ? { ...m, port: newPort } : m));
    setMultiPorts(next);
    const targetToken = selectedGroup?.primaryToken || tokenSel;
    saveMultiPortConfig(targetToken, multiPort, next);
  };

  const toggleEnabledForAddr = (addr) => {
    const current = multiPorts.find((m) => m.addr === addr);
    if (!current) return;
    const newEnabled = current.enabled === false;
    const next = multiPorts.map((m) => (m.addr === addr ? { ...m, enabled: newEnabled } : m));
    setMultiPorts(next);
    const targetToken = selectedGroup?.primaryToken || tokenSel;
    saveMultiPortConfig(targetToken, multiPort, next);
    toast(newEnabled ? `▶️ Resumed: ${addr}` : `⏸️ Paused: ${addr}`, 'info');
  };

  const setAllEnabled = (enabledVal) => {
    const next = multiPorts.map((m) => ({ ...m, enabled: enabledVal }));
    setMultiPorts(next);
    const targetToken = selectedGroup?.primaryToken || tokenSel;
    saveMultiPortConfig(targetToken, multiPort, next);
    toast(enabledVal ? '▶️ All subdomains resumed' : '⏸️ All subdomains paused', 'info');
  };

  useEffect(() => {
    if (!selectedGroup) return;
    (async () => {
      const saved = await loadMultiPortConfig(selectedGroup.primaryToken);
      setMultiPort(saved.multi_port_enabled !== false);
      const fallbackPort = (selToken?.local_port || '8080').toString();

      const addrs = (selectedGroup.items || []).map((a, i) => {
        const savedEntry = saved.ports?.[a.addr] || {};
        const port = savedEntry.port || a.local_port?.toString() || fallbackPort;
        return { ...a, port, enabled: savedEntry.enabled !== false };
      });
      setMultiPorts(addrs);
    })();
  }, [selectedGroup, selToken, loadMultiPortConfig]);

  const fallbackPort = (selToken?.local_port || '8080').toString();
  const port = fallbackPort;
  const portList = multiPort ? multiPorts.filter((m) => m.enabled !== false && m.port.trim()).map((m) => m.port.trim()) : null;
  const sshPort = info?.ssh_port || 2222;

  const buildDocker = () => {
    const multi = multiPort && portList?.length;
    const R = multi ? portList.map((p) => `-R0:127.0.0.1:${p}`).join(' ') : `-R0:127.0.0.1:${port}`;
    const user = multi ? `${tokenSel}--${portList.join(',')}` : tokenSel;
    return `docker run --rm -i alpine/openssh-client ssh \\\n  -p ${sshPort} ${R} \\\n  -o StrictHostKeyChecking=no ${keepAlive ? '-o ServerAliveInterval=30 ' : ''}\\\n  ${user}@ssh.iraglobaltech.com`;
  };

  const buildCmd = () => {
    if (!info || !tokenSel) return 'Create a token first in Manage Tokens →';
    if (cmdTab === 'cli') {
      return `iragt connect ${tokenSel}`;
    }
    if (cmdTab === 'curl') {
      return `curl -sSL https://iraglobaltech.com/run | bash -s ${tokenSel}`;
    }
    if (cmdTab === 'docker') return buildDocker();
    const multi = multiPort && portList?.length;
    let ssh = 'ssh';
    if (verbose) ssh += ' -v';
    ssh += ` -p ${sshPort}`;
    if (multi) portList.forEach((p) => { ssh += ` -R0:127.0.0.1:${p}`; });
    else ssh += ` -R0:127.0.0.1:${port}`;
    if (keepAlive) ssh += ' -o ServerAliveInterval=30';
    if (!strictHost) ssh += ' -o StrictHostKeyChecking=no';
    const user = multi ? `${tokenSel}--${portList.join(',')}` : tokenSel;
    ssh += ` ${user}@ssh.iraglobaltech.com`;

    // Wrap in auto-reconnect loop if enabled — works when copy-pasted directly
    if (autoReconnect) {
      if (platform === 'windows') {
        return `while ($true) { ${ssh}; Write-Host "Disconnected. Reconnecting in 3s..."; Start-Sleep -Seconds 3 }`;
      }
      return `while true; do\n  ${ssh}\n  echo "Disconnected. Reconnecting in 3s..."\n  sleep 3\ndone`;
    }
    return ssh;
  };

  const multiAddrs = multiPort && portList?.length
    ? multiPorts.filter((m) => m.enabled !== false && m.port.trim()).map((m) => `https://${m.addr}`)
    : [];
  const primaryAddr = selToken
    ? (() => {
        const rootAddr = selectedGroup?.rootDomain;
        return rootAddr ? `https://${rootAddr}` : 'https://—.iraglobaltech.com';
      })()
    : 'https://—.iraglobaltech.com';
  const previewUrl = multiAddrs.length > 1 ? multiAddrs.join('  ·  ') : primaryAddr;

  const download = (kind) => {
    const cmd = buildCmd();
    let content, filename;
    if (kind === 'bat') {
      content = `@echo off\r\nREM Tunnel startup script (Windows)\r\n${cmd}\r\npause\r\n`;
      filename = 'start-tunnel.bat';
    } else {
      const inner = autoReconnect
        ? `while true; do\n  ${cmd}\n  echo "Tunnel dropped — reconnecting in 3s..."\n  sleep 3\ndone`
        : cmd;
      content = `#!/bin/sh\n# Tunnel startup script (generated)\n${inner}\n`;
      filename = kind === 'command' ? 'start-tunnel.command' : 'start-tunnel.sh';
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Downloaded ' + filename);
  };

  const showQr = async () => {
    if (!selToken) { toast('Create a token first', 'error'); return; }
    try {
      const res = await fetch(`/api/v1/tunnels/qr?text=${encodeURIComponent(previewUrl)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('QR failed');
      const svg = await res.text();
      setQr('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))));
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-title">Configure Tunnel</div>
      <div className="page-subtitle">Build and customize your tunnel command</div>

      <div className="card">
        <div className="card-header">
          <h2>⚙️ Tunnel Settings</h2>
        </div>
        <div className="card-body">
          <div className="cfg-row">
            <div className="form-group" style={{ maxWidth: 180 }}>
              <label>Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="windows">Windows (CMD)</option>
                <option value="linux">Linux</option>
                <option value="mac">Mac</option>
              </select>
            </div>
            <div className="form-group cfg-field" style={{ flex: 1 }}>
              <label>Domain / Access Token</label>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <select value={tokenSel} onChange={(e) => setTokenSel(e.target.value)} style={{ flex: 1 }}>
                  {filteredMainDomains.map((g) => (
                    <option key={g.primaryToken} value={g.primaryToken}>
                      {g.rootDomain}
                    </option>
                  ))}
                  {filteredMainDomains.length === 0 && <option value="">No domains match</option>}
                </select>
                {mainDomains.length > 3 && (
                  <SearchBar value={tokenSearch} onChange={setTokenSearch} placeholder="Filter…" style={{ maxWidth: 140 }} />
                )}
              </div>
            </div>
          </div>
          <div className="form-row">
            <label className="checkbox-label" style={{ flex: '0 0 auto' }}>
              <input type="checkbox" checked={multiPort} onChange={(e) => { setMultiPort(e.target.checked); saveMultiPortConfig(tokenSel, e.target.checked, multiPorts); }} />
              Multi-port <span className="badge" style={{ marginLeft: '.2rem' }}>Pro</span> — each address → its own local port, one command
            </label>
          </div>
          {multiPort && selectedGroup && (
            <div className="multiport-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.75rem' }}>
                <div>
                  <p className="dim" style={{ fontSize: '.82rem', margin: 0 }}>
                    Subdomains under <strong>{selectedGroup.rootDomain}</strong>:
                  </p>
                  <span className="dim" style={{ fontSize: '.72rem' }}>
                    Showing {filteredMultiPorts.length} of {totalCount} {totalCount === 1 ? 'subdomain' : 'subdomains'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ fontSize: '.72rem', padding: '.2rem .55rem' }}
                    onClick={() => setAllEnabled(true)}
                    title="Enable all subdomains"
                  >
                    ▶️ Resume All
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ fontSize: '.72rem', padding: '.2rem .55rem' }}
                    onClick={() => setAllEnabled(false)}
                    title="Pause all subdomains"
                  >
                    ⏸️ Pause All
                  </button>
                </div>
              </div>

              {/* Search and filter bar */}
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                  <input
                    type="text"
                    value={subdomainSearch}
                    onChange={(e) => setSubdomainSearch(e.target.value)}
                    placeholder="🔍 Search by subdomain or port (e.g. whatsmark, 8051)..."
                    style={{ width: '100%', paddingRight: subdomainSearch ? '2rem' : undefined, fontSize: '.82rem' }}
                  />
                  {subdomainSearch && (
                    <button
                      type="button"
                      onClick={() => setSubdomainSearch('')}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--dim)',
                        fontSize: '.85rem',
                      }}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="tabs" style={{ margin: 0 }}>
                  <button
                    type="button"
                    className={`tab ${statusFilter === 'all' ? 'active' : ''}`}
                    style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
                    onClick={() => setStatusFilter('all')}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    type="button"
                    className={`tab ${statusFilter === 'enabled' ? 'active' : ''}`}
                    style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
                    onClick={() => setStatusFilter('enabled')}
                  >
                    Active ({enabledCount})
                  </button>
                  <button
                    type="button"
                    className={`tab ${statusFilter === 'paused' ? 'active' : ''}`}
                    style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
                    onClick={() => setStatusFilter('paused')}
                  >
                    Paused ({pausedCount})
                  </button>
                </div>
              </div>

              {/* Subdomain Rows */}
              {filteredMultiPorts.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', maxHeight: '380px', overflowY: 'auto', paddingRight: '.2rem' }}>
                  {filteredMultiPorts.map((m) => {
                    const enabled = m.enabled !== false;
                    return (
                      <div
                        key={m.addr}
                        className="multiport-row"
                        style={{
                          display: 'flex',
                          gap: '.5rem',
                          alignItems: 'center',
                          opacity: enabled ? 1 : 0.55,
                          flexWrap: 'wrap',
                          background: enabled ? 'var(--surface-1, rgba(255,255,255,0.03))' : 'transparent',
                          padding: '.45rem .65rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border, rgba(255,255,255,0.05))',
                        }}
                      >
                        <button
                          type="button"
                          className="toggle-switch"
                          role="switch"
                          aria-checked={enabled}
                          title={enabled ? 'Enabled — included in tunnel' : 'Disabled — excluded from tunnel'}
                          onClick={() => toggleEnabledForAddr(m.addr)}
                          style={{
                            flex: '0 0 auto',
                            width: 36,
                            height: 20,
                            borderRadius: 10,
                            border: 'none',
                            background: enabled ? 'var(--green)' : 'var(--surface-2)',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'background .2s',
                            padding: 0,
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: 2,
                              left: enabled ? 18 : 2,
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              background: '#fff',
                              transition: 'left .2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                            }}
                          />
                        </button>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.1rem', minWidth: 160 }}>
                          <span className="code" style={{ fontSize: '.82rem', fontWeight: 600 }}>{m.addr}</span>
                          <span className="dim" style={{ fontSize: '.68rem' }}>{m.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                          <span className="dim" style={{ fontSize: '.75rem' }}>Local Port:</span>
                          <input
                            type="number"
                            min="1"
                            max="65535"
                            placeholder="e.g. 8080"
                            style={{ width: 110, fontSize: '.82rem' }}
                            value={m.port || ''}
                            disabled={!enabled}
                            onChange={(e) => updatePortForAddr(m.addr, e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1.5rem', background: 'var(--surface-1)', borderRadius: '8px' }}>
                  <p className="dim" style={{ margin: '0 0 .5rem 0', fontSize: '.82rem' }}>🔍 No subdomains match your search or filter</p>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => { setSubdomainSearch(''); setStatusFilter('all'); }}
                  >
                    Clear Filter
                  </button>
                </div>
              )}
              <p className="dim" style={{ fontSize: '.72rem', marginTop: '.75rem', marginBottom: 0 }}>
                💡 Pro feature — all your domains and subdomains from one SSH connection. One tunnel handles everything.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>⚡ Generated Command</h2>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => { copyToClipboard(buildCmd()); toast('Command copied'); }}>📋 Copy</button>
            <button className="btn btn-sm" onClick={() => download('sh')} title="Download macOS/Linux script">⬇️ .sh</button>
            <button className="btn btn-sm" onClick={() => download('bat')} title="Download Windows batch file">⬇️ .bat</button>
            <button className="btn btn-sm" onClick={() => download('command')} title="Download double-clickable macOS app">⬇️ .command</button>
          </div>
        </div>
        <div className="card-body">
          <div className="tabs" style={{ marginBottom: '.75rem' }}>
            <button className={`tab ${cmdTab === 'cli' ? 'active' : ''}`} onClick={() => setCmdTab('cli')}>🚀 CLI (iragt)</button>
            <button className={`tab ${cmdTab === 'curl' ? 'active' : ''}`} onClick={() => setCmdTab('curl')}>⚡ cURL / Bash</button>
            <button className={`tab ${cmdTab === 'ssh' ? 'active' : ''}`} onClick={() => setCmdTab('ssh')}>SSH</button>
            <button className={`tab ${cmdTab === 'docker' ? 'active' : ''}`} onClick={() => setCmdTab('docker')}>Docker</button>
          </div>
          <p className="dim" style={{ marginBottom: '.5rem' }}>{PLATFORM_HINTS[platform]}</p>
          {cmdTab === 'cli' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', marginBottom: '1rem' }}>
              {/* Option 1: Global CLI */}
              <div
                style={{
                  background: 'var(--surface-1, #f8faff)',
                  border: '1px solid var(--border, rgba(74,85,162,0.15))',
                  borderRadius: '12px',
                  padding: '.85rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.45rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
                    <span style={{ fontSize: '.95rem' }}>📦</span>
                    <span style={{ fontWeight: 700, fontSize: '.86rem', color: 'var(--text)' }}>Option 1: Global CLI</span>
                    <span className="badge" style={{ fontSize: '.68rem', padding: '.1rem .4rem' }}>Installed</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ fontSize: '.76rem', padding: '.25rem .65rem' }}
                    onClick={() => { copyToClipboard(`iragt connect ${tokenSel}`); toast('iragt connect copied'); }}
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="cmd-box" style={{ margin: 0, padding: '.65rem .85rem' }}>
                  <pre style={{ margin: 0, color: 'var(--brand)', fontWeight: 600 }}>{`iragt connect ${tokenSel}`}</pre>
                </div>
                <div className="dim" style={{ fontSize: '.74rem' }}>
                  Run directly if you have iragt installed globally (<code>npm i -g iragt</code>).
                </div>
              </div>

              {/* Option 2: NPX */}
              <div
                style={{
                  background: 'var(--surface-1, #f8faff)',
                  border: '1px solid var(--border, rgba(74,85,162,0.15))',
                  borderRadius: '12px',
                  padding: '.85rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.45rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
                    <span style={{ fontSize: '.95rem' }}>⚡</span>
                    <span style={{ fontWeight: 700, fontSize: '.86rem', color: 'var(--text)' }}>Option 2: Without installing anything (NPX)</span>
                    <span className="badge" style={{ fontSize: '.68rem', padding: '.1rem .4rem', background: 'rgba(42,157,143,0.12)', color: 'var(--green)' }}>Zero-Install</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ fontSize: '.76rem', padding: '.25rem .65rem' }}
                    onClick={() => { copyToClipboard(`npx iragt connect ${tokenSel}`); toast('npx iragt connect copied'); }}
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="cmd-box" style={{ margin: 0, padding: '.65rem .85rem' }}>
                  <pre style={{ margin: 0, color: 'var(--brand)', fontWeight: 600 }}>{`npx iragt connect ${tokenSel}`}</pre>
                </div>
                <div className="dim" style={{ fontSize: '.74rem' }}>
                  Runs instantly with Node.js without needing any global installation.
                </div>
              </div>
            </div>
          ) : (
            <div className="cmd-box" style={{ marginBottom: '1rem' }}><pre>{buildCmd()}</pre></div>
          )}
          <div className="tunnel-preview">
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>{multiAddrs.length > 1 ? 'Your tunnel URLs will be:' : 'Your tunnel URL will be:'}</strong><br />
              {multiAddrs.length > 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', marginTop: '.3rem' }}>
                  {multiAddrs.map((url, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                      <span className="url" style={{ fontSize: '.85rem' }}>{url}</span>
                      <button className="icon-btn" title="Copy URL" style={{ fontSize: '.7rem', padding: '.1rem .3rem' }} onClick={() => { copyToClipboard(url); toast('URL copied'); }}>📋</button>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="url">{previewUrl}</span>
              )}
            </div>
            {multiAddrs.length <= 1 && <button className="btn btn-sm" onClick={showQr}>📱 QR Code</button>}
          </div>
          {qr && (
            <div className="qr-panel">
              <img src={qr} alt="Tunnel QR" />
              <div className="caption">Scan to open this tunnel URL on your phone</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>🛠️ Advanced Options</h2></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <label className="checkbox-label">
              <input type="checkbox" checked={keepAlive} onChange={(e) => setKeepAlive(e.target.checked)} />
              Keep Alive (30s interval)
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={autoReconnect} onChange={(e) => setAutoReconnect(e.target.checked)} />
              Auto-Reconnect (in downloaded script)
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={strictHost} onChange={(e) => setStrictHost(e.target.checked)} />
              Strict Host Key Check
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} />
              Verbose output (-v)
            </label>
          </div>
        </div>
      </div>
    </>
  );
}