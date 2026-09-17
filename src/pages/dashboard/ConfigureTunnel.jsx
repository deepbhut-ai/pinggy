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
      return `iragt connect ${tokenSel}\n\n# Or without installing anything:\nnpx iragt connect ${tokenSel}`;
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
              <p className="dim" style={{ fontSize: '.78rem', marginBottom: '.6rem' }}>
                All subdomains under <strong>{selectedGroup.rootDomain}</strong> — enter a local port for each:
              </p>
              {multiPorts.map((m, i) => {
                const enabled = m.enabled !== false;
                return (
                <div key={m.addr} className="multiport-row" style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.4rem', opacity: enabled ? 1 : 0.5 }}>
                  <button
                    type="button"
                    className="toggle-switch"
                    role="switch"
                    aria-checked={enabled}
                    title={enabled ? 'Enabled — included in tunnel' : 'Disabled — excluded from tunnel'}
                    onClick={() => {
                      const next = [...multiPorts];
                      const newEnabled = !enabled;
                      next[i] = { ...m, enabled: newEnabled };
                      setMultiPorts(next);
                      saveMultiPortConfig(tokenSel, multiPort, next);
                      toast(newEnabled ? `▶️ Resumed: ${m.addr}` : `⏸️ Paused: ${m.addr}`, 'info');
                    }}
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
                    <span style={{
                      position: 'absolute',
                      top: 2,
                      left: enabled ? 18 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left .2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                    }} />
                  </button>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.1rem' }}>
                    <span className="code" style={{ fontSize: '.8rem' }}>{m.addr}</span>
                    <span className="dim" style={{ fontSize: '.68rem' }}>{m.label}</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    placeholder={`e.g. ${3000 + i * 1000}`}
                    style={{ width: 130 }}
                    value={m.port}
                    disabled={!enabled}
                    onChange={(e) => {
                      const next = [...multiPorts];
                      next[i] = { ...m, port: e.target.value };
                      setMultiPorts(next);
                      saveMultiPortConfig(tokenSel, multiPort, next);
                    }}
                  />
                </div>
                );
              })}
              <p className="dim" style={{ fontSize: '.72rem', marginTop: '.6rem' }}>Pro feature — all your domains and subdomains from one SSH connection. No load on your PC — one tunnel handles everything.</p>
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
          <div className="cmd-box"><pre>{buildCmd()}</pre></div>
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