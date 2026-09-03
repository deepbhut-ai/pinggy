import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { copyToClipboard } from '../../utils';

const OS_HINTS = {
  cmd: 'Open Command Prompt (CMD) and paste the following command:',
  powershell: 'Open PowerShell and paste the following command:',
  linux: 'Open your terminal (Ctrl+Alt+T) and paste the following command:',
  mac: 'Open Terminal (Cmd+Space → "Terminal") and paste the following command:',
};

// Quickstart — tunnel setup steps only (token, command, quick reference).
// The overview/dashboard part lives on the Dashboard page.
export default function Quickstart() {
  const { user } = useAuth();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [localPort, setLocalPort] = useState(8080);
  const [os, setOs] = useState('cmd');
  const [autoReconnect, setAutoReconnect] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(true);
  const [customDomain, setCustomDomain] = useState('');
  const [dnsStatus, setDnsStatus] = useState(null);
  const [detectedOS, setDetectedOS] = useState('windows');

  const token = tokens.length > 0 ? tokens[0].token : '';
  const isPro = (user?.plan || 'free') === 'pro';

  const load = useCallback(async () => {
    try {
      const [infoD, tokensD] = await Promise.all([
        api('/tunnels/info'),
        api('/tokens').catch(() => []),
      ]);
      setInfo(infoD);
      setTokens(tokensD);
      if (tokensD[0]) setCustomDomain(tokensD[0].custom_domain || '');
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Auto-detect OS and set the default tab
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Mac|iPhone|iPad|iPod/i.test(ua)) {
      setDetectedOS('mac');
      setOs('mac');
    } else if (/Win/i.test(ua)) {
      setDetectedOS('windows');
      setOs('cmd'); // Windows default: CMD (user can switch to PowerShell)
    } else {
      setDetectedOS('linux');
      setOs('linux');
    }
  }, []);

  const sshHost = info?.domain?.includes('iraglobaltech.com') ? 'ssh.iraglobaltech.com' : (info?.domain || '');
  const sshPort = info?.ssh_port || 2222;

  const buildCmd = () => {
    if (!token) return 'Create a token first in Manage Tokens →';
    const ssh = `ssh -p ${sshPort} -R0:127.0.0.1:${localPort} -o StrictHostKeyChecking=no -o ServerAliveInterval=30 ${token}@${sshHost}`;
    if (!autoReconnect) return ssh;
    if (os === 'cmd') {
      return `for /L %i in (0,1,2147483647) do @(${ssh} & echo Disconnected. Reconnecting in 5 seconds... & timeout /t 5 /nobreak >nul)`;
    }
    if (os === 'powershell') {
      return `while ($true) { ${ssh}; Write-Host "Disconnected. Reconnecting in 5 seconds..."; Start-Sleep -Seconds 5 }`;
    }
    return `while true; do\n  ${ssh}\n  echo "Disconnected. Reconnecting in 5 seconds..."\n  sleep 5\ndone`;
  };

  const saveCustomDomain = async (clear = false) => {
    try {
      const d = clear ? '' : customDomain.trim();
      const data = await api(`/users/me/custom-domain?custom_domain=${encodeURIComponent(d)}&token_id=${encodeURIComponent(tokens[0]?.id || '')}`, 'PUT');
      if (data.dns_status) {
        setDnsStatus(data.dns_status);
        toast(data.dns_status.message);
      } else {
        setDnsStatus(null);
        toast(clear ? 'Custom domain cleared' : `${d} saved`);
      }
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const verifyDomain = async () => {
    if (!tokens[0]?.custom_domain) return;
    try {
      toast('Checking DNS...');
      const data = await api(`/users/me/verify-domain?domain=${encodeURIComponent(tokens[0].custom_domain)}`);
      setDnsStatus(data);
      toast(data.message);
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Quickstart</div>
          <div className="page-subtitle">Set up your tunnel in three steps</div>
        </div>
        <div className="page-toolbar-actions">
          <a className="btn btn-ghost btn-sm" href="/dashboard">← Dashboard</a>
        </div>
      </div>

      <div className="quickstart-intro">
        <div>
          <div className="section-label">Tunnel setup</div>
          <h2>Expose your local app in three steps</h2>
          <p>Choose a port, copy the command, and keep the terminal open while your tunnel is running.</p>
          <div className="feature-row">
            <span className="feature-badge">⚡ Fast share</span>
            <span className="feature-badge">🔒 Secure</span>
            <span className="feature-badge">🌐 Custom domain ready</span>
          </div>
        </div>
        <div className="intro-mark">↗</div>
      </div>

      {/* Domain info header — shows subdomain + custom domain at a glance */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-body" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="dim" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.3rem' }}>🔗 Your tunnel addresses</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span className="badge">Subdomain</span>
                <a href={`https://${tokens[0]?.subdomain || '—'}.iraglobaltech.com`} target="_blank" rel="noreferrer" className="code" style={{ color: 'var(--brand)', fontWeight: 600 }}>
                  https://{tokens[0]?.subdomain || '—'}.iraglobaltech.com
                </a>
                {tokens[0]?.subdomain && (
                  <button className="icon-btn" title="Copy" onClick={() => { copyToClipboard(`https://${tokens[0].subdomain}.iraglobaltech.com`); toast('Copied'); }}>📋</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span className="badge badge-blue">Custom domain</span>
                {tokens[0]?.custom_domain ? (
                  <>
                    <a href={`https://${tokens[0].custom_domain}`} target="_blank" rel="noreferrer" className="code" style={{ color: 'var(--green)', fontWeight: 600 }}>
                      https://{tokens[0].custom_domain}
                    </a>
                    <button className="icon-btn" title="Copy" onClick={() => { copyToClipboard(`https://${tokens[0].custom_domain}`); toast('Copied'); }}>📋</button>
                  </>
                ) : (
                  <span className="dim" style={{ fontSize: '.85rem' }}>Not set — add one below ↓</span>
                )}
              </div>
            </div>
          </div>
          <a className="btn btn-ghost btn-sm" href="/dashboard/domains">Manage Domains →</a>
        </div>
      </div>

      <div className="timeline">
        {/* Step 1: token */}
        <div className="tl-item">
          <div className="tl-bullet">1</div>
          <div className="tl-title">
            <h3>Your access token</h3>
            <p>Use this token to authenticate your tunnel connection.</p>
          </div>
          <div className="tl-card">
            <p className="dim" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem' }}>Access token</p>
            <div className="token-row">
              <input type="text" value={tokenVisible ? token : '••••••••••••••••'} readOnly />
              <button className="icon-btn" title="Copy token" onClick={() => { copyToClipboard(token); toast('Token copied'); }}>📋</button>
              <button className="icon-btn" title="Show/Hide token" onClick={() => setTokenVisible(!tokenVisible)}>{tokenVisible ? '🙈' : '👁'}</button>
            </div>
            {!token && (
              <div className="inline-note amber">
                <strong>No token yet.</strong> Create one under Manage Tokens.
              </div>
            )}
            {isPro ? (
              <div className="domain-box">
                <p className="dim" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem' }}>Custom Domain / Subdomain (Pro — unlimited)</p>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <input type="text" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="e.g. serverira.com" style={{ flex: 1 }} />
                  <button className="btn btn-sm" onClick={() => saveCustomDomain(false)}>Save</button>
                  {tokens[0]?.custom_domain && <button className="btn btn-sm btn-ghost" onClick={() => saveCustomDomain(true)}>Clear</button>}
                </div>
                <details style={{ marginTop: '.6rem' }} open>
                  <summary style={{ fontSize: '.85rem', cursor: 'pointer', fontWeight: 600 }}>📋 How to set up your domain / subdomain</summary>
                  <div className="dns-help">
                    <p className="dns-step"><strong>Step 1: Add your domain to Cloudflare</strong></p>
                    <p>• Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer">Cloudflare Dashboard</a> → Add Site → enter your domain</p>
                    <p>• Change nameservers at your domain registrar</p>
                    <p className="dns-step"><strong>Step 2: Add DNS A Record</strong></p>
                    <p>• Type: <strong>A</strong> | Name: <strong>@</strong> | Content: <strong>13.140.131.204</strong> | Proxy: <strong>Proxied</strong></p>
                    <p>• For subdomains (e.g. app.mydomain.com): Name: <strong>app</strong> instead of @</p>
                    <p className="dns-step"><strong>Step 3: Set SSL mode</strong></p>
                    <p>• Cloudflare → SSL/TLS → Overview → set to <strong>Flexible</strong></p>
                    <p className="dns-step"><strong>Step 4: Enter domain above and click Save</strong></p>
                    <p>• Your tunnel will be accessible at <span className="code">https://yourdomain.com</span> — reconnect the tunnel to see it in the SSH banner.</p>
                  </div>
                </details>
                {dnsStatus && (
                  <div className={`inline-note ${dnsStatus.status === 'ok' ? '' : 'amber'}`} style={{ margin: '.5rem 0 0', fontSize: '.82rem' }}>
                    <span>{dnsStatus.message}</span>
                    {dnsStatus.status !== 'ok' && <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '.2rem .5rem', fontSize: '.72rem' }} onClick={verifyDomain}>🔄 Re-check</button>}
                  </div>
                )}
                {tokens[0]?.custom_domain && !dnsStatus && (
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: '.5rem', fontSize: '.75rem' }} onClick={verifyDomain}>🔍 Verify DNS</button>
                )}
              </div>
            ) : (
              <div className="domain-box">
                <p className="dim" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem' }}>Custom Domain / Subdomain <span className="badge" style={{ marginLeft: '.3rem' }}>Free plan — 1 domain</span></p>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <input type="text" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="e.g. myapp.com" style={{ flex: 1 }} />
                  <button className="btn btn-sm" onClick={() => saveCustomDomain(false)}>Save</button>
                  {tokens[0]?.custom_domain && <button className="btn btn-sm btn-ghost" onClick={() => saveCustomDomain(true)}>Clear</button>}
                </div>
                <details style={{ marginTop: '.6rem' }} open>
                  <summary style={{ fontSize: '.85rem', cursor: 'pointer', fontWeight: 600 }}>📋 How to set up your domain / subdomain</summary>
                  <div className="dns-help">
                    <p className="dns-step"><strong>Step 1: Add your domain to Cloudflare</strong></p>
                    <p>• Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer">Cloudflare Dashboard</a> → Add Site → enter your domain</p>
                    <p>• Change nameservers at your domain registrar</p>
                    <p className="dns-step"><strong>Step 2: Add DNS A Record</strong></p>
                    <p>• Type: <strong>A</strong> | Name: <strong>@</strong> | Content: <strong>13.140.131.204</strong> | Proxy: <strong>Proxied</strong></p>
                    <p>• For subdomains (e.g. app.mydomain.com): Name: <strong>app</strong> instead of @</p>
                    <p className="dns-step"><strong>Step 3: Set SSL mode</strong></p>
                    <p>• Cloudflare → SSL/TLS → Overview → set to <strong>Flexible</strong></p>
                    <p className="dns-step"><strong>Step 4: Enter domain above and click Save</strong></p>
                    <p>• Your tunnel will be accessible at <span className="code">https://yourdomain.com</span> — reconnect the tunnel to see it in the SSH banner.</p>
                  </div>
                </details>
                {dnsStatus && (
                  <div className={`inline-note ${dnsStatus.status === 'ok' ? '' : 'amber'}`} style={{ margin: '.5rem 0 0', fontSize: '.82rem' }}>
                    <span>{dnsStatus.message}</span>
                    {dnsStatus.status !== 'ok' && <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '.2rem .5rem', fontSize: '.72rem' }} onClick={verifyDomain}>🔄 Re-check</button>}
                  </div>
                )}
                {tokens[0]?.custom_domain && !dnsStatus && (
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: '.5rem', fontSize: '.75rem' }} onClick={verifyDomain}>🔍 Verify DNS</button>
                )}
                <p className="dim" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>Free plan includes 1 custom domain. <a href="/dashboard/plan" style={{ color: 'var(--brand)' }}>Upgrade to Pro</a> for unlimited domains.</p>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: command */}
        <div className="tl-item">
          <div className="tl-bullet">2</div>
          <div className="tl-title">
            <h3>Paste this command to start tunnel</h3>
          </div>
          <div className="tl-card">
            <div className="os-tabs">
              {detectedOS === 'windows' ? (
                // Windows: show CMD + PowerShell
                [
                  ['cmd', 'CMD', '🪟'], ['powershell', 'PowerShell', '>_'],
                ].map(([key, label, icon]) => (
                  <button key={key} className={`os-tab ${os === key ? 'active' : ''}`} onClick={() => setOs(key)}>{icon} {label}</button>
                ))
              ) : detectedOS === 'mac' ? (
                // Mac: show Terminal only
                [['mac', 'Terminal', '🍎']].map(([key, label, icon]) => (
                  <button key={key} className={`os-tab ${os === key ? 'active' : ''}`} onClick={() => setOs(key)}>{icon} {label}</button>
                ))
              ) : (
                // Linux: show Terminal only
                [['linux', 'Terminal', '🐧']].map(([key, label, icon]) => (
                  <button key={key} className={`os-tab ${os === key ? 'active' : ''}`} onClick={() => setOs(key)}>{icon} {label}</button>
                ))
              )}
              {/* Always show the other OS options as secondary */}
              {detectedOS !== 'windows' && (
                <>
                  <button className={`os-tab ${os === 'cmd' ? 'active' : ''}`} onClick={() => setOs('cmd')}>🪟 CMD</button>
                  <button className={`os-tab ${os === 'powershell' ? 'active' : ''}`} onClick={() => setOs('powershell')}>>_ PowerShell</button>
                </>
              )}
              {detectedOS !== 'mac' && (
                <button className={`os-tab ${os === 'mac' ? 'active' : ''}`} onClick={() => setOs('mac')}>🍎 Mac</button>
              )}
              {detectedOS !== 'linux' && (
                <button className={`os-tab ${os === 'linux' ? 'active' : ''}`} onClick={() => setOs('linux')}>🐧 Linux</button>
              )}
            </div>
            {/* How to open terminal hint per OS */}
            <p className="dim" style={{ fontSize: '.78rem', marginBottom: '.5rem', padding: '.4rem .6rem', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              {os === 'cmd' && '💡 Open Command Prompt: Press Win+R → type "cmd" → Enter'}
              {os === 'powershell' && '💡 Open PowerShell: Press Win+X → click "Windows PowerShell"'}
              {os === 'linux' && '💡 Open Terminal: Press Ctrl+Alt+T (or search "Terminal" in your app menu)'}
              {os === 'mac' && '💡 Open Terminal: Press Cmd+Space → type "Terminal" → Enter'}
            </p>
            <label className="checkbox-label">
              <input type="checkbox" checked={autoReconnect} onChange={(e) => setAutoReconnect(e.target.checked)} />
              Automatically reconnect if the server or network disconnects
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
              <label style={{ fontSize: '.85rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Local port:</label>
              <input type="number" value={localPort} min="1" max="65535" onChange={(e) => setLocalPort(parseInt(e.target.value) || 8080)} style={{ width: 80 }} />
              <span style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>The port your local service runs on</span>
            </div>
            <p className="dim" style={{ marginBottom: '.5rem' }}>{OS_HINTS[os]}</p>
            <div className="cmd-box cmd-box-relative">
              <pre>{buildCmd()}</pre>
              <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(buildCmd()); toast('Command copied'); }}>📋 Copy</button>
            </div>
          </div>
        </div>

        {/* Step 3: quick reference */}
        <div className="tl-item">
          <div className="tl-bullet">3</div>
          <div className="tl-title">
            <h3>Quick Reference</h3>
            <p>Alternative SSH command format</p>
          </div>
          <div className="tl-card">
            <p style={{ fontSize: '.85rem', marginBottom: '.5rem' }}>Open your terminal and run:</p>
            <div className="cmd-box cmd-box-relative">
              <pre>ssh -p {sshPort} -R0:127.0.0.1:8000 {sshHost}</pre>
              <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(`ssh -p ${sshPort} -R0:127.0.0.1:8000 ${sshHost}`); toast('Copied'); }}>📋</button>
            </div>
            <p className="dim" style={{ marginTop: '.5rem', fontSize: '.8rem' }}>Replace <strong>8000</strong> with the port where your service is running.</p>
          </div>
        </div>
      </div>
    </>
  );
}