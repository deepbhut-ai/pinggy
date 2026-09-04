import { useEffect, useState, useCallback } from 'react';
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

const TOTAL_STEPS = 5;
const STORAGE_KEY = 'pinggy_quickstart_progress';

const STEP_META = [
  { icon: '🔑', label: 'Token',    title: 'Get your access token',     desc: 'Your token is like a password that connects your computer to our server.' },
  { icon: '🌐', label: 'Domain',   title: 'Configure your domain',     desc: 'View your subdomain and optionally add a custom domain.' },
  { icon: '📋', label: 'Command',  title: 'Copy your tunnel command',  desc: 'Choose your operating system and local port, then copy the command.' },
  { icon: '▶️', label: 'Run',      title: 'Run the command',           desc: 'Open your terminal, paste the command, and press Enter.' },
  { icon: '🎉', label: 'Access',   title: 'Access your tunnel',        desc: 'Your tunnel is live — share the URL with anyone.' },
];

// Quickstart — animated guided wizard for complete beginners.
export default function Quickstart() {
  const { user } = useAuth();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [localPort, setLocalPort] = useState('');
  const [os, setOs] = useState('cmd');
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [portError, setPortError] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(true);
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [dnsStatus, setDnsStatus] = useState(null);
  const [dnsChecking, setDnsChecking] = useState(false);
  const [detectedOS, setDetectedOS] = useState('windows');
  const [selectedOS, setSelectedOS] = useState('windows');
  const [animKey, setAnimKey] = useState(0); // forces re-mount for enter animation
  const [selectedTokenId, setSelectedTokenId] = useState(null);

  const [currentStep, setCurrentStep] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
      return saved >= 1 && saved <= TOTAL_STEPS ? saved : 1;
    } catch { return 1; }
  });

  const selectedToken = tokens.find((t) => t.id === selectedTokenId) || tokens[0] || null;
  const token = selectedToken?.token || '';
  const isPro = (user?.plan || 'free') === 'pro';

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(currentStep));
    setAnimKey((k) => k + 1); // trigger enter animation on step change
  }, [currentStep]);

  const goNext = () => {
    if (currentStep < TOTAL_STEPS) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      if (nextStep === TOTAL_STEPS) {
        toast('🎉 All done! Your tunnel is ready to use.', 'success');
      } else {
        toast(`Step ${currentStep} done! Moving to step ${nextStep}…`, 'success');
      }
    }
  };

  const goPrev = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  const resetWizard = () => {
    setCurrentStep(1);
    localStorage.setItem(STORAGE_KEY, '1');
    toast('Started over — step 1');
  };

  const load = useCallback(async () => {
    try {
      const [infoD, tokensD] = await Promise.all([
        api('/tunnels/info'),
        api('/tokens').catch(() => []),
      ]);
      setInfo(infoD);
      setTokens(tokensD);
      if (tokensD[0] && !selectedTokenId) setSelectedTokenId(tokensD[0].id);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast, selectedTokenId]);

  useEffect(() => { load(); }, [load]);

  // Toast when token state changes (instead of inline messages on page)
  const [prevTokenState, setPrevTokenState] = useState(null);
  useEffect(() => {
    const state = token ? 'has_token' : 'no_token';
    if (prevTokenState !== null && prevTokenState !== state) {
      if (state === 'no_token') toast('No token yet — create one in Manage Tokens', 'error');
      else toast('Token ready! Copy it and click Next to continue', 'success');
    }
    setPrevTokenState(state);
  }, [token, prevTokenState, toast]);

  // If user lands directly on last step (e.g. after refresh), show the success toast
  const [shownFinalToast, setShownFinalToast] = useState(false);
  useEffect(() => {
    if (currentStep === TOTAL_STEPS && !shownFinalToast) {
      toast('🎉 All done! Your tunnel is ready to use.', 'success');
      setShownFinalToast(true);
    }
  }, [currentStep, shownFinalToast, toast]);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Mac|iPhone|iPad|iPod/i.test(ua)) { setDetectedOS('mac'); setSelectedOS('mac'); setOs('mac'); }
    else if (/Win/i.test(ua)) { setDetectedOS('windows'); setSelectedOS('windows'); setOs('cmd'); }
    else { setDetectedOS('linux'); setSelectedOS('linux'); setOs('linux'); }
  }, []);

  const sshHost = info?.domain?.includes('iraglobaltech.com') ? 'ssh.iraglobaltech.com' : (info?.domain || '');
  const sshPort = info?.ssh_port || 2222;
  const subdomain = selectedToken?.subdomain || '';

  const buildCmd = () => {
    if (!token) return 'Create a token first in step 1 →';
    if (!localPort) return 'Enter a local port to generate your tunnel command';
    const ssh = `ssh -p ${sshPort} -R0:127.0.0.1:${localPort} -o StrictHostKeyChecking=no -o ServerAliveInterval=30 ${token}@${sshHost}`;
    if (!autoReconnect) return ssh;
    if (os === 'cmd') return `for /L %i in (0,1,2147483647) do @(${ssh} & echo Disconnected. Reconnecting in 5 seconds... & timeout /t 5 /nobreak >nul)`;
    if (os === 'powershell') return `while ($true) { ${ssh}; Write-Host "Disconnected. Reconnecting in 5 seconds..."; Start-Sleep -Seconds 5 }`;
    return `while true; do\n  ${ssh}\n  echo "Disconnected. Reconnecting in 5 seconds..."\n  sleep 5\ndone`;
  };

  const goNextFromStep3 = () => {
    const port = Number(localPort);
    if (!localPort || !Number.isInteger(port) || port < 1 || port > 65535) {
      setPortError(true);
      toast('Enter a valid local port from 1 to 65535', 'error');
      return;
    }
    setPortError(false);
    goNext();
  };

  const verifyCustomDomain = async () => {
    const d = customDomainInput.trim().toLowerCase();
    if (!d) return toast('Enter a domain first', 'error');
    if (!selectedToken) return toast('Select a token first', 'error');
    try {
      await api(`/users/me/custom-domain?custom_domain=${encodeURIComponent(d)}&token_id=${encodeURIComponent(selectedToken.id)}`, 'PUT');
      setDnsStatus(null);
      toast(`${d} added — checking domain health...`);
      setCustomDomainInput('');
      await load();
      await verifyDomain(d);
    } catch (e) { toast(e.message, 'error'); }
  };

  const verifyDomain = async (domain) => {
    const d = (domain || selectedToken?.custom_domain || '').trim().toLowerCase();
    if (!d) return;
    setDnsChecking(true);
    setDnsStatus(null);
    try {
      toast('Checking domain health...');
      const data = await api(`/users/me/verify-domain?domain=${encodeURIComponent(d)}`);
      setDnsStatus(data);
      toast(data.message);
    } catch (e) { toast(e.message, 'error'); }
    setDnsChecking(false);
  };

  // ── Step content renderers ──

  const renderStep1 = () => (
    <div className="wizard-step-card wizard-animate-in" key={animKey}>
      <div className="wizard-step-header">
        <span className="wizard-step-icon wizard-icon-pulse">🔑</span>
        <div>
          <h3>Step 1 — Get your access token</h3>
          <p className="dim">Your token is like a password that connects your computer to our server. You already have one — just copy it below.</p>
        </div>
      </div>

      <div className="wizard-step-body">
        <div className="wizard-info-box wizard-fade-in" style={{ animationDelay: '.1s' }}>
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>📋 What is a token?</p>
          <p className="dim" style={{ fontSize: '.82rem', lineHeight: 1.6 }}>
            A token is a unique code that identifies your account. When you run a command on your computer,
            the token tells our server "this is me, let me in." Without it, the server won't know who you are.
          </p>
        </div>

        <p className="dim wizard-fade-in" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem', animationDelay: '.2s' }}>Your access token</p>
        <div className="wizard-fade-in token-dropdown-wrapper" style={{ animationDelay: '.25s' }}>
          {/* Single box: shows token value + Free/Pro tag, click to expand options below */}
          <div className="token-dropdown-box" onClick={() => tokens.length > 0 && setTokenDropdownOpen(!tokenDropdownOpen)}>
            <span className="token-dropdown-value code">
              {token ? (tokenVisible ? token : '••••••••••••••••') : 'No token yet'}
            </span>
            <div className="token-dropdown-right">
              <span className={`badge ${isPro ? 'badge-blue' : ''}`} style={{ fontSize: '.65rem' }}>{isPro ? 'Pro' : 'Free'}</span>
              {token && (
                <>
                  <button className="icon-btn" title="Copy token" onClick={(e) => { e.stopPropagation(); copyToClipboard(token); toast('Token copied!'); }}>📋</button>
                  <button className="icon-btn" title="Show/Hide token" onClick={(e) => { e.stopPropagation(); setTokenVisible(!tokenVisible); }}>{tokenVisible ? '🙈' : '👁'}</button>
                </>
              )}
              {tokens.length > 0 && <span className="token-dropdown-chevron">{tokenDropdownOpen ? '▲' : '▼'}</span>}
            </div>
          </div>
          {/* Expanded options below */}
          {tokenDropdownOpen && tokens.length > 0 && (
            <div className="token-dropdown-options">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className={`token-dropdown-option ${t.id === selectedTokenId ? 'selected' : ''}`}
                  onClick={() => { setSelectedTokenId(t.id); setTokenDropdownOpen(false); }}
                >
                  <span className="code">{t.token.substring(0, 8)}…</span>
                  <span className="dim" style={{ fontSize: '.78rem' }}>{t.name || 'Unnamed'}</span>
                  <span className={`badge ${isPro ? 'badge-blue' : ''}`} style={{ fontSize: '.6rem' }}>{isPro ? 'Pro' : 'Free'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="wizard-step-nav wizard-fade-in" style={{ animationDelay: '.4s' }}>
          <span />
          <button className="btn btn-sm" onClick={goNext} disabled={!token}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="wizard-step-card wizard-animate-in" key={animKey}>
      <div className="wizard-step-header">
        <span className="wizard-step-icon wizard-icon-pulse">🌐</span>
        <div>
          <h3>Step 2 — Configure your domain</h3>
          <p className="dim">Your tunnel comes with a free subdomain. You can also add a custom domain like myapp.com.</p>
        </div>
      </div>

      <div className="wizard-step-body">
        {/* Show the selected token's domain info */}
        {selectedToken && (
          <div className="wizard-fade-in wizard-info-box" style={{ animationDelay: '.1s' }}>
            <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>🌐 Your tunnel domain</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span className="badge" style={{ flexShrink: 0 }}>Subdomain</span>
                <a href={`https://${selectedToken.subdomain}.iraglobaltech.com`} target="_blank" rel="noreferrer" className="code" style={{ color: 'var(--brand)', fontWeight: 600, fontSize: '.82rem' }}>
                  https://{selectedToken.subdomain}.iraglobaltech.com
                </a>
                <button className="icon-btn" title="Copy" onClick={() => { copyToClipboard(`https://${selectedToken.subdomain}.iraglobaltech.com`); toast('Copied!'); }}>📋</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span className="badge badge-blue" style={{ flexShrink: 0 }}>Custom domain</span>
                {selectedToken.custom_domain ? (
                  <>
                    <a href={`https://${selectedToken.custom_domain}`} target="_blank" rel="noreferrer" className="code" style={{ color: 'var(--green)', fontWeight: 600, fontSize: '.82rem' }}>
                      https://{selectedToken.custom_domain}
                    </a>
                    <button className="icon-btn" title="Copy" onClick={() => { copyToClipboard(`https://${selectedToken.custom_domain}`); toast('Copied!'); }}>📋</button>
                  </>
                ) : (
                  <span className="dim" style={{ fontSize: '.82rem' }}>Not set — add one below ↓</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DNS verification — show when custom domain is set */}
        {selectedToken && selectedToken.custom_domain && (
          <div className="wizard-fade-in wizard-info-box" style={{ animationDelay: '.15s' }}>
            <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>🔍 Verify your domain</p>
            <p className="dim" style={{ fontSize: '.78rem', lineHeight: 1.5, marginBottom: '.5rem' }}>
              Check if your domain's DNS is correctly pointing to our server.
            </p>
            <button className="btn btn-sm" onClick={() => verifyDomain()} disabled={dnsChecking || dnsStatus?.status === 'ok'}>
              {dnsChecking ? '🔄 Checking...' : dnsStatus?.status === 'ok' ? '✅ Verified' : dnsStatus ? '🔄 Re-verify' : '🔍 Verify'}
            </button>
            {dnsStatus && (
              <div className={`inline-note wizard-fade-in ${dnsStatus.status === 'ok' ? '' : 'amber'}`} style={{ marginTop: '.5rem', fontSize: '.82rem' }}>
                <span>{dnsStatus.message}</span>
                {dnsStatus.status !== 'ok' && (
                  <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '.2rem .5rem', fontSize: '.72rem' }} onClick={() => verifyDomain()} disabled={dnsChecking}>
                    🔄 Re-check
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Custom domain setup — only show if not already set */}
        {selectedToken && !selectedToken.custom_domain && (
          <div className="wizard-fade-in wizard-info-box" style={{ animationDelay: '.2s' }}>
            <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>🔗 Add a custom domain (optional)</p>
            <p className="dim" style={{ fontSize: '.78rem', lineHeight: 1.5, marginBottom: '.75rem' }}>
              Want to use your own domain like <span className="code">myapp.com</span> instead of the subdomain? Follow these steps.
            </p>

            {/* Animated step-by-step DNS instructions */}
            <div className="dns-guide">
              {[
                { num: 1, title: 'Add your domain to Cloudflare', body: 'Go to Cloudflare Dashboard → Add Site → enter your domain. Change nameservers at your domain registrar.', link: 'https://dash.cloudflare.com', linkText: 'Open Cloudflare →' },
                { num: 2, title: 'Add DNS A Record', body: 'Type: A | Name: @ | Content: 13.140.131.204 | Proxy: Proxied. For subdomains (e.g. app.mydomain.com): Name: app instead of @.' },
                { num: 3, title: 'Set SSL mode', body: 'Cloudflare → SSL/TLS → Overview → set to Flexible.' },
                { num: 4, title: 'Enter your domain and verify', body: 'Type your domain in the box below and click Verify. We will check its health endpoint and confirm when it reaches our server.', isLast: true },
              ].map((step, i) => (
                <div key={i} className="dns-guide-step wizard-fade-in" style={{ animationDelay: `${.3 + i * .15}s` }}>
                  <div className="dns-guide-num">{step.num}</div>
                  <div className="dns-guide-content">
                    <div className="dns-guide-title">{step.title}</div>
                    <div className="dns-guide-body">{step.body}</div>
                    {step.link && <a href={step.link} target="_blank" rel="noreferrer" className="dns-guide-link">{step.linkText}</a>}
                  </div>
                </div>
              ))}
            </div>

            {/* Domain input */}
            <div className="wizard-fade-in" style={{ animationDelay: '.95s', display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '1rem' }}>
              <input type="text" value={customDomainInput} onChange={(e) => setCustomDomainInput(e.target.value)} placeholder="e.g. myapp.com" style={{ flex: 1 }} />
              <button className="btn btn-sm" onClick={verifyCustomDomain} disabled={dnsChecking}>
                {dnsChecking ? '🔄 Checking...' : '✅ Verify'}
              </button>
            </div>
          </div>
        )}

        {selectedToken && selectedToken.custom_domain && (
          <div className="wizard-fade-in inline-note" style={{ background: 'rgba(41,169,127,.08)', borderColor: 'rgba(41,169,127,.3)', animationDelay: '.2s' }}>
            <span>✅ Custom domain is set! You can change it in <a href="/dashboard/domains" style={{ color: 'var(--brand)' }}>Manage Domains</a>.</span>
          </div>
        )}

        <div className="wizard-step-nav wizard-fade-in" style={{ animationDelay: '.3s' }}>
          <button className="btn btn-sm btn-ghost" onClick={goPrev}>← Back</button>
          <button className="btn btn-sm" onClick={goNext}>Next →</button>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="wizard-step-card wizard-animate-in" key={animKey}>
      <div className="wizard-step-header">
        <span className="wizard-step-icon wizard-icon-pulse">📋</span>
        <div>
          <h3>Step 3 — Copy your tunnel command</h3>
          <p className="dim">Choose your operating system and local port, then copy the command below.</p>
        </div>
      </div>

      <div className="wizard-step-body">
        <div className="wizard-info-box wizard-fade-in" style={{ animationDelay: '.1s' }}>
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>📋 What is this command?</p>
          <p className="dim" style={{ fontSize: '.82rem', lineHeight: 1.6 }}>
            This is a single line of text you'll paste into your computer's terminal (command window).
            It connects your local app to our server using your token from step 1.
          </p>
        </div>

        <p className="dim wizard-fade-in" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem', animationDelay: '.2s' }}>Choose your operating system</p>
        <div className="os-tabs wizard-fade-in" style={{ animationDelay: '.25s' }}>
          <button className={`os-tab ${selectedOS === 'windows' ? 'active' : ''}`} onClick={() => { setSelectedOS('windows'); setOs('cmd'); }}>🪟 Windows</button>
          <button className={`os-tab ${selectedOS === 'mac' ? 'active' : ''}`} onClick={() => { setSelectedOS('mac'); setOs('mac'); }}>🍎 Mac</button>
          <button className={`os-tab ${selectedOS === 'linux' ? 'active' : ''}`} onClick={() => { setSelectedOS('linux'); setOs('linux'); }}>🐧 Linux</button>
        </div>

        {selectedOS === 'windows' && (
          <>
            <p className="dim wizard-fade-in" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem', marginTop: '.75rem', animationDelay: '.3s' }}>Choose your terminal</p>
            <div className="os-tabs wizard-fade-in" style={{ animationDelay: '.35s' }}>
              <button className={`os-tab ${os === 'cmd' ? 'active' : ''}`} onClick={() => setOs('cmd')}>🪟 Command Prompt (CMD)</button>
              <button className={`os-tab ${os === 'powershell' ? 'active' : ''}`} onClick={() => setOs('powershell')}>{'>_'} PowerShell</button>
            </div>
          </>
        )}
        {selectedOS === 'mac' && (
          <p className="dim wizard-fade-in" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem', marginTop: '.75rem', animationDelay: '.3s' }}>Terminal is the only option on Mac.</p>
        )}
        {selectedOS === 'linux' && (
          <p className="dim wizard-fade-in" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem', marginTop: '.75rem', animationDelay: '.3s' }}>Terminal is the only option on Linux.</p>
        )}

        <p className="dim wizard-fade-in" style={{ fontSize: '.78rem', marginBottom: '.5rem', padding: '.4rem .6rem', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', animationDelay: '.4s' }}>
          {os === 'cmd' && '💡 Open Command Prompt: Press Win+R → type "cmd" → Enter'}
          {os === 'powershell' && '💡 Open PowerShell: Press Win+X → click "Windows PowerShell"'}
          {os === 'linux' && '💡 Open Terminal: Press Ctrl+Alt+T (or search "Terminal" in your app menu)'}
          {os === 'mac' && '💡 Open Terminal: Press Cmd+Space → type "Terminal" → Enter'}
        </p>

        <label className="checkbox-label wizard-fade-in" style={{ animationDelay: '.45s' }}>
          <input type="checkbox" checked={autoReconnect} onChange={(e) => setAutoReconnect(e.target.checked)} />
          Automatically reconnect if the server or network disconnects
        </label>

        <div className="wizard-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem', animationDelay: '.5s' }}>
          <label style={{ fontSize: '.85rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Local port:</label>
          <input
            type="number"
            value={localPort}
            min="1"
            max="65535"
            placeholder="e.g. 8080"
            aria-invalid={portError}
            onChange={(e) => { setLocalPort(e.target.value); setPortError(false); }}
            onBlur={() => {
              const port = Number(localPort);
              setPortError(!localPort || !Number.isInteger(port) || port < 1 || port > 65535);
            }}
            style={{ width: 110, borderColor: portError ? 'var(--red)' : undefined }}
          />
          {portError && <span style={{ color: 'var(--red)', fontSize: '.78rem' }}>Required: enter a port from 1 to 65535</span>}
          <span style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>The port your local service runs on (e.g. 3000, 8080)</span>
        </div>

        <p className="dim wizard-fade-in" style={{ marginBottom: '.5rem', animationDelay: '.55s' }}>{OS_HINTS[os]}</p>

        {localPort && !portError && (
          <div className="cmd-box cmd-box-relative wizard-fade-in" style={{ animationDelay: '.6s' }}>
            <pre>{buildCmd()}</pre>
            <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(buildCmd()); toast('Command copied!'); }}>📋 Copy</button>
          </div>
        )}

        <div className="wizard-step-nav wizard-fade-in" style={{ animationDelay: '.65s' }}>
          <button className="btn btn-sm btn-ghost" onClick={goPrev}>← Back</button>
          <button className="btn btn-sm" onClick={goNextFromStep3}>Next →</button>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="wizard-step-card wizard-animate-in" key={animKey}>
      <div className="wizard-step-header">
        <span className="wizard-step-icon wizard-icon-pulse">▶️</span>
        <div>
          <h3>Step 4 — Run the command in your terminal</h3>
          <p className="dim">Open your terminal, paste the command, and press Enter. Keep the window open.</p>
        </div>
      </div>

      <div className="wizard-step-body">
        <div className="wizard-info-box">
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>📋 Follow these steps</p>
          <ol className="wizard-checklist">
            {[
              { strong: 'Open your terminal', rest: os === 'cmd' ? '— Press Win+R, type "cmd", press Enter' : os === 'powershell' ? '— Press Win+X, click "Windows PowerShell"' : os === 'linux' ? '— Press Ctrl+Alt+T' : '— Press Cmd+Space, type "Terminal", press Enter' },
              { strong: 'Paste the command', rest: '— Right-click in the terminal and select "Paste" (or use Ctrl+Shift+V on Linux)' },
              { strong: 'Press Enter', rest: '— The terminal will show a connection message with your tunnel URL' },
              { strong: 'Keep the terminal open', rest: '— Your tunnel stays active only while this window is running' },
            ].map((item, i) => (
              <li key={i} className="wizard-checklist-item" style={{ animationDelay: `${.15 + i * .12}s` }}>
                <span className="wizard-checklist-num">{i + 1}</span>
                <span><strong>{item.strong}</strong> {item.rest}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="inline-note wizard-fade-in" style={{ background: 'rgba(245,158,11,.08)', borderColor: 'rgba(245,158,11,.3)', animationDelay: '.7s' }}>
          <span>⚠️ <strong>Don't close the terminal!</strong> If you close it, your tunnel will stop working.</span>
        </div>

        <div className="wizard-step-nav wizard-fade-in" style={{ animationDelay: '.8s' }}>
          <button className="btn btn-sm btn-ghost" onClick={goPrev}>← Back</button>
          <button className="btn btn-sm" onClick={goNext}>Next →</button>
        </div>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="wizard-step-card wizard-animate-in" key={animKey}>
      <div className="wizard-step-header">
        <span className="wizard-step-icon wizard-icon-celebrate">🎉</span>
        <div>
          <h3>Step 5 — Access your tunnel!</h3>
          <p className="dim">Your tunnel is now live. Use the URL below to share your local app with anyone.</p>
        </div>
      </div>

      <div className="wizard-step-body">
        <div className="wizard-info-box wizard-fade-in" style={{ animationDelay: '.1s' }}>
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>🌐 Your tunnel address</p>
          {subdomain ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <a href={`https://${subdomain}.iraglobaltech.com`} target="_blank" rel="noreferrer" className="code wizard-url-pop" style={{ color: 'var(--brand)', fontWeight: 700, fontSize: '1rem' }}>
                https://{subdomain}.iraglobaltech.com
              </a>
              <button className="icon-btn" title="Copy" onClick={() => { copyToClipboard(`https://${subdomain}.iraglobaltech.com`); toast('Copied!'); }}>📋</button>
            </div>
          ) : (
            <p className="dim" style={{ fontSize: '.85rem' }}>Your subdomain will appear here once your tunnel connects. Make sure you ran the command in step 3.</p>
          )}
        </div>

        <div className="wizard-info-box wizard-fade-in" style={{ animationDelay: '.2s' }}>
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>📋 What now?</p>
          <ul className="wizard-checklist" style={{ paddingLeft: 0 }}>
            {[
              'Open the URL in your browser — you\'ll see your local app live on the internet',
              'Share this URL with anyone — they can access your app from anywhere',
              'To stop the tunnel, just close the terminal window',
            ].map((text, i) => (
              <li key={i} className="wizard-checklist-item" style={{ animationDelay: `${.3 + i * .12}s` }}>
                <span className="wizard-checklist-num">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
          {isPro ? (
            <li className="wizard-checklist-item" style={{ animationDelay: '.66s', listStyle: 'none' }}>
              <span className="wizard-checklist-num">4</span>
              <span>Want a custom domain like <span className="code">myapp.com</span>? Go to <a href="/dashboard/domains" style={{ color: 'var(--brand)' }}>Manage Domains</a></span>
            </li>
          ) : (
            <li className="wizard-checklist-item" style={{ animationDelay: '.66s', listStyle: 'none' }}>
              <span className="wizard-checklist-num">4</span>
              <span>Want a custom domain? <a href="/dashboard/plan" style={{ color: 'var(--brand)' }}>Upgrade to Pro</a> for unlimited domains</span>
            </li>
          )}
        </div>

        <div className="wizard-step-nav wizard-fade-in" style={{ animationDelay: '.8s' }}>
          <button className="btn btn-sm btn-ghost" onClick={goPrev}>← Back</button>
          <button className="btn btn-sm btn-ghost" onClick={resetWizard}>↺ Start over</button>
        </div>
      </div>
    </div>
  );

  const steps = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Quickstart</div>
          <div className="page-subtitle">Set up your tunnel step by step</div>
        </div>
        <div className="page-toolbar-actions">
          <a className="btn btn-ghost btn-sm" href="/dashboard">← Dashboard</a>
        </div>
      </div>

      {/* Animated step indicator with connecting lines */}
      <div className="wizard-dots">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
          <div key={n} className="wizard-dot-group">
            {n > 1 && <div className={`wizard-dot-line ${n <= currentStep ? 'filled' : ''}`} />}
            <div className={`wizard-dot ${n === currentStep ? 'active' : ''} ${n < currentStep ? 'done' : ''}`}>
              {n < currentStep ? '✓' : n}
            </div>
            <span className={`wizard-dot-label ${n === currentStep ? 'current' : ''} ${n < currentStep ? 'done' : ''}`}>
              {STEP_META[n - 1].label}
            </span>
          </div>
        ))}
      </div>

      {/* Only the current step is shown with animation */}
      {steps[currentStep - 1]()}
    </>
  );
}