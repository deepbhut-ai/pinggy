import { useEffect, useState, useCallback } from 'react';
import { api, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { copyToClipboard } from '../../utils';

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

export default function ConfigureTunnel() {
  const { user } = useAuth();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [configs, setConfigs] = useState([]);

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
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);

  const isPro = (user?.plan || 'free') === 'pro';

  const load = useCallback(async () => {
    try {
      const [infoD, tokensD, configsD] = await Promise.all([
        api('/tunnels/info'),
        api('/tokens'),
        api('/configs').catch(() => []),
      ]);
      setInfo(infoD);
      setTokens(tokensD);
      setConfigs(configsD);
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

  // multi-port rows: subdomain → primary → extras
  useEffect(() => {
    if (!multiPort || !selToken) return;
    const addrs = [`${selToken.subdomain}.iraglobaltech.com`];
    if (selToken.custom_domain) addrs.push(selToken.custom_domain);
    (selToken.domains || []).forEach((d) => addrs.push(d));
    setMultiPorts(addrs.map((a) => ({ addr: a, port: '' })));
  }, [multiPort, tokenSel]);

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
  const previewUrl = selToken
    ? (isTcp
        ? `tcp://iraglobaltech.com:${selToken.tcp_port || '— (set in Manage Tokens)'}`
        : `https://${selToken.fixed_subdomain || selToken.subdomain}.iraglobaltech.com`)
    : 'https://—.iraglobaltech.com';

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

  const saveConfig = async () => {
    const name = window.prompt('Name this configuration:', 'My tunnel');
    if (!name) return;
    try {
      await api('/configs', 'POST', {
        name,
        config: {
          preset,
          local_addr: localAddr,
          platform,
          token: tokenSel,
          keep_alive: keepAlive,
          auto_reconnect: autoReconnect,
          strict_host: strictHost,
          verbose,
        },
      });
      toast('Configuration saved');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const loadConfig = (id) => {
    const cfg = configs.find((c) => String(c.id) === String(id));
    if (!cfg) return;
    const c = cfg.config || {};
    if (c.local_addr) setLocalAddr(c.local_addr);
    if (c.preset && APP_PRESETS.some((a) => a.key === c.preset)) setPreset(c.preset);
    if (c.platform) setPlatform(c.platform);
    if (c.token && tokens.some((t) => t.token === c.token)) setTokenSel(c.token);
    if (c.keep_alive !== undefined) setKeepAlive(c.keep_alive);
    if (c.auto_reconnect !== undefined) setAutoReconnect(c.auto_reconnect);
    if (c.strict_host !== undefined) setStrictHost(c.strict_host);
    if (c.verbose !== undefined) setVerbose(c.verbose);
    toast('Configuration loaded');
  };

  const reset = () => {
    setLocalAddr('127.0.0.1:8080');
    setPreset('preset-0');
    setMultiPort(false);
    setKeepAlive(true);
    setAutoReconnect(false);
    setStrictHost(false);
    setVerbose(false);
    setCmdTab('ssh');
    setQr(null);
    toast('Configuration reset');
  };

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Configure Tunnel</div>
          <div className="page-subtitle">Build and customize your tunnel command</div>
        </div>
        <div className="page-toolbar-actions">
          <a className="btn btn-ghost btn-sm" href="/dashboard">← Dashboard</a>
        </div>
      </div>

      {/* Token selector + tunnel settings */}
      <div className="card">
        <div className="card-header">
          <h2>Tunnel Settings</h2>
        </div>
        <div className="card-body">
          {/* 1. Token selector — first */}
          <label className="dim" style={{ fontSize: '.78rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Access token</label>
          <div className="token-dropdown-wrapper" style={{ marginBottom: '1rem' }}>
            <div className="token-dropdown-box" onClick={() => tokens.length > 0 && setTokenDropdownOpen(!tokenDropdownOpen)}>
              <span className="token-dropdown-value code">
                {tokenSel ? (tokenVisible ? tokenSel : '••••••••••••••••') : 'No token selected'}
              </span>
              <div className="token-dropdown-right">
                <span className={`badge ${isPro ? 'badge-blue' : ''}`} style={{ fontSize: '.65rem' }}>{isPro ? 'Pro' : 'Free'}</span>
                {tokenSel && (
                  <>
                    <button className="icon-btn" title="Copy token" onClick={(e) => { e.stopPropagation(); copyToClipboard(tokenSel); toast('Token copied!'); }}>📋</button>
                    <button className="icon-btn" title="Show/Hide token" onClick={(e) => { e.stopPropagation(); setTokenVisible(!tokenVisible); }}>{tokenVisible ? '🙈' : '👁'}</button>
                  </>
                )}
                {tokens.length > 0 && <span className="token-dropdown-chevron">{tokenDropdownOpen ? '▲' : '▼'}</span>}
              </div>
            </div>
            {tokenDropdownOpen && tokens.length > 0 && (
              <div className="token-dropdown-options">
                {tokens.map((t) => (
                  <div
                    key={t.id}
                    className={`token-dropdown-option ${t.token === tokenSel ? 'selected' : ''}`}
                    onClick={() => { setTokenSel(t.token); setTokenDropdownOpen(false); }}
                  >
                    <span className="code">{t.token.substring(0, 8)}…</span>
                    <span className="dim" style={{ fontSize: '.78rem' }}>{t.name || 'Unnamed'}</span>
                    <span className={`badge ${isPro ? 'badge-blue' : ''}`} style={{ fontSize: '.6rem' }}>{isPro ? 'Pro' : 'Free'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Multi-port toggle — right after token */}
          <label className="checkbox-label" style={{ marginBottom: '1rem', fontSize: '.85rem' }}>
            <input type="checkbox" checked={multiPort} onChange={(e) => setMultiPort(e.target.checked)} />
            Multi-port — run multiple services through one tunnel
          </label>

          {/* 3a. Multi-port ENABLED — show address → port list */}
          {multiPort && selToken && (
            <div className="multiport-box">
              <p className="dim" style={{ fontSize: '.78rem', marginBottom: '.5rem' }}>
                Each address routes to its own local port — one SSH command for all:
              </p>
              {multiPorts.map((m, i) => (
                <div key={m.addr} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.4rem' }}>
                  <span className="code" style={{ flex: 1, fontSize: '.8rem' }}>{m.addr}</span>
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
            </div>
          )}

          {/* 3b. Multi-port DISABLED — show single service config */}
          {!multiPort && (
            <div className="form-row">
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
              <div className="form-group" style={{ flex: 1 }}>
                <label>Local address — what you want to share</label>
                <input type="text" value={localAddr} onChange={(e) => setLocalAddr(e.target.value)} placeholder="127.0.0.1:8080" />
              </div>
            </div>
          )}
          <div className="form-row">
            <div className="form-group" style={{ maxWidth: 180 }}>
              <label>Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="windows">Windows (CMD)</option>
                <option value="linux">Linux</option>
                <option value="mac">Mac</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Generated Command</h2>
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
          <div className="inline-note" style={{ marginTop: '.75rem' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>Your tunnel URL will be:</strong><br />
              <span style={{ color: 'var(--brand)' }} className="code">{previewUrl}</span>
            </div>
            <button className="btn btn-sm" onClick={showQr}>📱 QR Code</button>
          </div>
          {qr && (
            <div style={{ marginTop: '.75rem', textAlign: 'center', padding: '.75rem', background: '#fff', borderRadius: 'var(--radius)' }}>
              <img src={qr} alt="Tunnel QR" style={{ height: 180, width: 180 }} />
              <div style={{ fontSize: '.75rem', color: '#475569', marginTop: '.35rem' }}>Scan to open this tunnel URL on your phone</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Advanced Options</h2></div>
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