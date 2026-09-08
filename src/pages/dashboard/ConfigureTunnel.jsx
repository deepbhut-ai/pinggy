import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, getToken } from '../../api/client';
import { useToast } from '../../components/Toast';
import { copyToClipboard } from '../../utils';
import { SearchBar } from '../../components/TableControls';

const APP_PRESETS = [
  { n: 'Custom / manual', p: 8080 },
  { n: 'Django (runserver)', p: 8000 }, { n: 'Flask', p: 5000 },
  { n: 'Jupyter Notebook', p: 8888 }, { n: 'Node.js / Express', p: 3000 },
  { n: 'React / Vite dev', p: 5173 }, { n: 'Next.js', p: 3000 },
  { n: 'Vue / Nuxt', p: 3000 }, { n: 'Laravel (artisan)', p: 8000 },
  { n: 'WordPress', p: 80 }, { n: 'Nginx', p: 80 }, { n: 'Apache', p: 8080 },
  { n: 'MySQL', p: 3306 }, { n: 'PostgreSQL', p: 5432 },
  { n: 'MongoDB', p: 27017 }, { n: 'Redis', p: 6379 },
].map((a, i) => ({ ...a, key: `preset-${i}` }));

const PLATFORM_HINTS = {
  windows: 'Open Command Prompt (CMD) and paste the following command:',
  linux: 'Open terminal and paste the following command:',
  mac: 'Open Terminal and paste the following command:',
};

function isRootDomain(domain) {
  if (!domain) return false;
  const labels = domain.replace(/^https?:\/\//, '').split('.').filter(Boolean);
  return labels.length <= 2;
}

function tokenAddresses(t, allTokens = [], includeAll = false) {
  const addrs = [];
  if (t.subdomain && !t.custom_domain && (t.domains || []).length === 0) {
    addrs.push({ addr: `${t.subdomain}.iraglobaltech.com`, label: '🌐 Subdomain' });
  }
  if (t.custom_domain) {
    addrs.push({ addr: t.custom_domain, label: isRootDomain(t.custom_domain) ? '🌐 Domain' : '🔗 Subdomain' });
  }
  (t.domains || []).forEach((d) => addrs.push({ addr: d, label: '➕ Extra domain' }));
  if (includeAll) {
    allTokens.forEach((other) => {
      if (other.id === t.id) return;
      if (other.custom_domain && !addrs.some((a) => a.addr === other.custom_domain)) {
        addrs.push({ addr: other.custom_domain, label: isRootDomain(other.custom_domain) ? '🌐 Domain' : '🔗 Subdomain' });
      }
      if (other.subdomain && !other.custom_domain && (other.domains || []).length === 0 && !addrs.some((a) => a.addr === `${other.subdomain}.iraglobaltech.com`)) {
        addrs.push({ addr: `${other.subdomain}.iraglobaltech.com`, label: '🌐 Subdomain' });
      }
      (other.domains || []).forEach((d) => {
        if (!addrs.some((a) => a.addr === d)) addrs.push({ addr: d, label: '➕ Extra domain' });
      });
    });
  }
  return addrs;
}

export default function ConfigureTunnel() {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [tokens, setTokens] = useState([]);

  const [preset, setPreset] = useState('preset-0');
  const [localAddr, setLocalAddr] = useState('127.0.0.1:8080');
  const [tunnelType, setTunnelType] = useState('http');
  const [platform, setPlatform] = useState('windows');
  const [tokenSel, setTokenSel] = useState('');
  const [multiPort, setMultiPort] = useState(false);
  const [multiPorts, setMultiPorts] = useState([]);
  const [cmdTab, setCmdTab] = useState('ssh');
  const [keepAlive, setKeepAlive] = useState(true);
  const [autoReconnect, setAutoReconnect] = useState(false);
  const [strictHost, setStrictHost] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [qr, setQr] = useState(null);

  const load = useCallback(async () => {
    try {
      const [infoD, tokensD] = await Promise.all([
        api('/tunnels/info'),
        api('/tokens'),
      ]);
      setInfo(infoD);
      setTokens(tokensD);
      // pick the first token on initial load (or keep the current selection valid)
      setTokenSel((cur) => {
        if (cur && tokensD.some((t) => t.token === cur)) return cur;
        return tokensD.length ? tokensD[0].token : '';
      });
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => {
    load();
    // auto-detect platform
    const ua = navigator.userAgent;
    const detected = /Mac|iPhone|iPad|iPod/i.test(ua) ? 'mac' : /Win/i.test(ua) ? 'windows' : 'linux';
    setPlatform(detected);
  }, [load]);

  const selToken = tokens.find((t) => t.token === tokenSel);
  const port = localAddr.split(':').pop() || '8080';
  const [tokenSearch, setTokenSearch] = useState('');

  // Update local address when token changes — load saved port from Connection Guide
  useEffect(() => {
    if (!selToken) return;
    const savedPort = localStorage.getItem(`token-port-${selToken.id}`);
    if (savedPort) {
      setLocalAddr(`127.0.0.1:${savedPort}`);
    }
  }, [tokenSel, selToken]);

  const filteredTokens = useMemo(() => {
    if (!tokenSearch.trim()) return tokens;
    const q = tokenSearch.trim().toLowerCase();
    return tokens.filter((t) =>
      String(t.name || '').toLowerCase().includes(q) ||
      String(t.subdomain || '').toLowerCase().includes(q) ||
      String(t.token || '').toLowerCase().includes(q) ||
      String(t.custom_domain || '').toLowerCase().includes(q)
    );
  }, [tokens, tokenSearch]);

  useEffect(() => {
    if (!multiPort || !selToken) return;
    const addrs = tokenAddresses(selToken, tokens, true).map((a, i) => {
      // Try to load saved port from the token guide for this address
      const allTokens = [selToken, ...tokens.filter((t) => t.id !== selToken.id)];
      const matchingToken = allTokens.find((t) =>
        t.custom_domain === a.addr ||
        (t.subdomain && `${t.subdomain}.iraglobaltech.com` === a.addr) ||
        (t.domains || []).includes(a.addr)
      );
      let port = '';
      if (matchingToken) {
        const saved = localStorage.getItem(`token-port-${matchingToken.id}`);
        if (saved) port = saved;
      }
      return { ...a, port };
    });
    setMultiPorts(addrs);
  }, [multiPort, tokenSel, selToken, tokens]);

  const portList = multiPort ? multiPorts.map((m) => m.port.trim()).filter(Boolean) : null;
  const sshPort = info?.ssh_port || 2222;

  const buildDocker = () => {
    const multi = multiPort && portList?.length;
    const R = multi ? portList.map((p) => `-R0:127.0.0.1:${p}`).join(' ') : `-R0:127.0.0.1:${port}`;
    const user = multi ? `${tokenSel}--${portList.join(',')}` : tokenSel;
    return `docker run --rm -i alpine/openssh-client ssh \\\n  -p ${sshPort} ${R} \\\n  -o StrictHostKeyChecking=no ${keepAlive ? '-o ServerAliveInterval=30 ' : ''}\\\n  ${user}@ssh.iraglobaltech.com`;
  };

  const buildCmd = () => {
    if (!info || !tokenSel) return 'Create a token first in Manage Tokens →';
    if (cmdTab === 'docker') return buildDocker();
    const multi = multiPort && portList?.length;
    let cmd = 'ssh';
    if (verbose) cmd += ' -v';
    cmd += ` -p ${sshPort}`;
    if (multi) portList.forEach((p) => { cmd += ` -R0:127.0.0.1:${p}`; });
    else cmd += ` -R0:127.0.0.1:${port}`;
    if (keepAlive) cmd += ' -o ServerAliveInterval=30';
    if (!strictHost) cmd += ' -o StrictHostKeyChecking=no';
    const user = multi ? `${tokenSel}--${portList.join(',')}` : tokenSel;
    cmd += ` ${user}@ssh.iraglobaltech.com`;
    return cmd;
  };

  // TCP mode (Pro): the public port is the token's persistent TCP port
  const isTcp = tunnelType === 'tcp';
  const multiAddrs = multiPort && portList?.length
    ? multiPorts.filter((m) => m.port.trim()).map((m) => `https://${m.addr}`)
    : [];
  const primaryAddr = selToken
    ? (isTcp
        ? `tcp://iraglobaltech.com:${selToken.tcp_port || '— (set in Manage Tokens)'}`
        : (() => {
            const addrs = tokenAddresses(selToken, tokens);
            return addrs[0] ? `https://${addrs[0].addr}` : 'https://—.iraglobaltech.com';
          })())
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
            <div className="form-group" style={{ maxWidth: 240 }}>
              <label>App / Service preset</label>
              <select
                value={preset}
                onChange={(e) => {
                  const p = APP_PRESETS.find((a) => a.key === e.target.value);
                  setPreset(e.target.value);
                  if (p) setLocalAddr(`127.0.0.1:${p.p}`);
                }}
              >
                {APP_PRESETS.map((a) => <option key={a.key} value={a.key}>{a.n} — :{a.p}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ maxWidth: 130 }}>
              <label>Tunnel type</label>
              <select value={tunnelType} onChange={(e) => setTunnelType(e.target.value)}>
                <option value="http">HTTP</option>
                <option value="tcp">TCP (Pro)</option>
              </select>
            </div>
            {isTcp && (
              <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
                <label>TCP mode</label>
                <div className="inline-note amber" style={{ margin: 0, padding: '.5rem .7rem' }}>
                  TCP tunnels use the token's persistent port. {selToken?.tcp_port
                    ? <>Your public port: <strong className="code">{selToken.tcp_port}</strong></>
                    : <>Set the port under <strong>Manage Tokens → Edit → Tunnel type</strong>.</>}
                </div>
              </div>
            )}
            <div className="form-group cfg-field">
              <label>Local address — what you want to share</label>
              <input type="text" value={localAddr} onChange={(e) => setLocalAddr(e.target.value)} placeholder="127.0.0.1:8080" />
            </div>
          </div>
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
              <label>Access token</label>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <select value={tokenSel} onChange={(e) => setTokenSel(e.target.value)} style={{ flex: 1 }}>
                  {filteredTokens.map((t) => {
                    const addrs = tokenAddresses(t, tokens).map((a) => a.addr);
                    const label = addrs.length ? addrs.join(', ') : (t.name || 'Unnamed');
                    return (
                      <option key={t.id} value={t.token}>
                        {label} — {t.token.substring(0, 8)}...
                      </option>
                    );
                  })}
                  {filteredTokens.length === 0 && <option value="">No tokens match</option>}
                </select>
                {tokens.length > 3 && (
                  <SearchBar value={tokenSearch} onChange={setTokenSearch} placeholder="Filter…" style={{ maxWidth: 140 }} />
                )}
              </div>
            </div>
          </div>
          <div className="form-row">
            <label className="checkbox-label" style={{ flex: '0 0 auto' }}>
              <input type="checkbox" checked={multiPort} onChange={(e) => setMultiPort(e.target.checked)} />
              Multi-port <span className="badge" style={{ marginLeft: '.2rem' }}>Pro</span> — each address → its own local port, one command
            </label>
          </div>
          {multiPort && selToken && (
            <div className="multiport-box">
              <p className="dim" style={{ fontSize: '.78rem', marginBottom: '.6rem' }}>
                All domains and subdomains on your account — one SSH command, one tunnel, all addresses. Enter a local port for each:
              </p>
              {multiPorts.map((m, i) => (
                <div key={m.addr} className="multiport-row" style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.4rem' }}>
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
                    onChange={(e) => {
                      const next = [...multiPorts];
                      next[i] = { ...m, port: e.target.value };
                      setMultiPorts(next);
                    }}
                  />
                </div>
              ))}
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
            <button className={`tab ${cmdTab === 'ssh' ? 'active' : ''}`} onClick={() => setCmdTab('ssh')}>SSH</button>
            <button className={`tab ${cmdTab === 'docker' ? 'active' : ''}`} onClick={() => setCmdTab('docker')}>Docker</button>
          </div>
          <p className="dim" style={{ marginBottom: '.5rem' }}>{PLATFORM_HINTS[platform]}</p>
          <div className="cmd-box"><pre>{buildCmd()}</pre></div>
          <div className="tunnel-preview">
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>Your tunnel URL will be:</strong><br />
              <span className="url">{previewUrl}</span>
            </div>
            <button className="btn btn-sm" onClick={showQr}>📱 QR Code</button>
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