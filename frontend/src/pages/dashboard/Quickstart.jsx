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

const TOTAL_STEPS = 4;
const STORAGE_KEY = 'pinggy_quickstart_progress';

// Quickstart — clean guided wizard for complete beginners.
// Only the page-toolbar shows at top. Then one step at a time.
// Step 1: Get your token  →  Step 2: Copy your command
// Step 3: Run it in terminal  →  Step 4: Access your tunnel
export default function Quickstart() {
  const { user } = useAuth();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [localPort, setLocalPort] = useState(8080);
  const [os, setOs] = useState('cmd');
  const [autoReconnect, setAutoReconnect] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(true);
  const [detectedOS, setDetectedOS] = useState('windows');
  const [selectedOS, setSelectedOS] = useState('windows');

  // Which step the user is currently on (1-indexed). Only one step visible at a time.
  const [currentStep, setCurrentStep] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
      return saved >= 1 && saved <= TOTAL_STEPS ? saved : 1;
    } catch { return 1; }
  });

  const token = tokens.length > 0 ? tokens[0].token : '';
  const isPro = (user?.plan || 'free') === 'pro';

  // Persist current step so user doesn't lose place on refresh.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(currentStep));
  }, [currentStep]);

  const goNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1);
      toast(`Step ${currentStep} done! Moving to step ${currentStep + 1}…`, 'success');
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
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Auto-detect OS
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Mac|iPhone|iPad|iPod/i.test(ua)) { setDetectedOS('mac'); setSelectedOS('mac'); setOs('mac'); }
    else if (/Win/i.test(ua)) { setDetectedOS('windows'); setSelectedOS('windows'); setOs('cmd'); }
    else { setDetectedOS('linux'); setSelectedOS('linux'); setOs('linux'); }
  }, []);

  const sshHost = info?.domain?.includes('iraglobaltech.com') ? 'ssh.iraglobaltech.com' : (info?.domain || '');
  const sshPort = info?.ssh_port || 2222;
  const subdomain = tokens[0]?.subdomain || '';

  const buildCmd = () => {
    if (!token) return 'Create a token first in step 1 →';
    const ssh = `ssh -p ${sshPort} -R0:127.0.0.1:${localPort} -o StrictHostKeyChecking=no -o ServerAliveInterval=30 ${token}@${sshHost}`;
    if (!autoReconnect) return ssh;
    if (os === 'cmd') return `for /L %i in (0,1,2147483647) do @(${ssh} & echo Disconnected. Reconnecting in 5 seconds... & timeout /t 5 /nobreak >nul)`;
    if (os === 'powershell') return `while ($true) { ${ssh}; Write-Host "Disconnected. Reconnecting in 5 seconds..."; Start-Sleep -Seconds 5 }`;
    return `while true; do\n  ${ssh}\n  echo "Disconnected. Reconnecting in 5 seconds..."\n  sleep 5\ndone`;
  };

  // ── Step content renderers ──

  const renderStep1 = () => (
    <div className="wizard-step-card">
      <div className="wizard-step-header">
        <span className="wizard-step-icon">🔑</span>
        <div>
          <h3>Step 1 — Get your access token</h3>
          <p className="dim">Your token is like a password that connects your computer to our server. You already have one — just copy it below.</p>
        </div>
      </div>

      <div className="wizard-step-body">
        <div className="wizard-info-box">
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>📋 What is a token?</p>
          <p className="dim" style={{ fontSize: '.82rem', lineHeight: 1.6 }}>
            A token is a unique code that identifies your account. When you run a command on your computer,
            the token tells our server "this is me, let me in." Without it, the server won't know who you are.
          </p>
        </div>

        <p className="dim" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem' }}>Your access token</p>
        <div className="token-row">
          <input type="text" value={tokenVisible ? token : '••••••••••••••••'} readOnly />
          <button className="icon-btn" title="Copy token" onClick={() => { copyToClipboard(token); toast('Token copied!'); }}>📋</button>
          <button className="icon-btn" title="Show/Hide token" onClick={() => setTokenVisible(!tokenVisible)}>{tokenVisible ? '🙈' : '👁'}</button>
        </div>

        {!token ? (
          <div className="inline-note amber">
            <strong>No token yet.</strong> Go to <a href="/dashboard/tokens" style={{ color: 'var(--brand)' }}>Manage Tokens</a> to create one, then come back here.
          </div>
        ) : (
          <div className="inline-note" style={{ background: 'rgba(41,169,127,.08)', borderColor: 'rgba(41,169,127,.3)' }}>
            <span>✅ Your token is ready! Copy it and click "Next" to continue.</span>
          </div>
        )}

        <div className="wizard-step-nav">
          <span />
          <button className="btn btn-sm" onClick={goNext} disabled={!token}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="wizard-step-card">
      <div className="wizard-step-header">
        <span className="wizard-step-icon">📋</span>
        <div>
          <h3>Step 2 — Copy your tunnel command</h3>
          <p className="dim">Choose your operating system and local port, then copy the command below.</p>
        </div>
      </div>

      <div className="wizard-step-body">
        <div className="wizard-info-box">
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>📋 What is this command?</p>
          <p className="dim" style={{ fontSize: '.82rem', lineHeight: 1.6 }}>
            This is a single line of text you'll paste into your computer's terminal (command window).
            It connects your local app to our server using your token from step 1.
          </p>
        </div>

        <p className="dim" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem' }}>Choose your operating system</p>
        <div className="os-tabs">
          <button className={`os-tab ${selectedOS === 'windows' ? 'active' : ''}`} onClick={() => { setSelectedOS('windows'); setOs('cmd'); }}>🪟 Windows</button>
          <button className={`os-tab ${selectedOS === 'mac' ? 'active' : ''}`} onClick={() => { setSelectedOS('mac'); setOs('mac'); }}>🍎 Mac</button>
          <button className={`os-tab ${selectedOS === 'linux' ? 'active' : ''}`} onClick={() => { setSelectedOS('linux'); setOs('linux'); }}>🐧 Linux</button>
        </div>

        {/* Sub-options: Windows has CMD + PowerShell, Mac/Linux just Terminal */}
        {selectedOS === 'windows' && (
          <>
            <p className="dim" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem', marginTop: '.75rem' }}>Choose your terminal</p>
            <div className="os-tabs">
              <button className={`os-tab ${os === 'cmd' ? 'active' : ''}`} onClick={() => setOs('cmd')}>🪟 Command Prompt (CMD)</button>
              <button className={`os-tab ${os === 'powershell' ? 'active' : ''}`} onClick={() => setOs('powershell')}>{'>_'} PowerShell</button>
            </div>
          </>
        )}
        {selectedOS === 'mac' && (
          <p className="dim" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem', marginTop: '.75rem' }}>Terminal is the only option on Mac.</p>
        )}
        {selectedOS === 'linux' && (
          <p className="dim" style={{ marginBottom: '.4rem', fontWeight: 600, fontSize: '.8rem', marginTop: '.75rem' }}>Terminal is the only option on Linux.</p>
        )}

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
          <span style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>The port your local service runs on (e.g. 3000, 8080)</span>
        </div>

        <p className="dim" style={{ marginBottom: '.5rem' }}>{OS_HINTS[os]}</p>

        <div className="cmd-box cmd-box-relative">
          <pre>{buildCmd()}</pre>
          <button className="btn btn-sm copy-btn" onClick={() => { copyToClipboard(buildCmd()); toast('Command copied!'); }}>📋 Copy</button>
        </div>

        <div className="wizard-step-nav">
          <button className="btn btn-sm btn-ghost" onClick={goPrev}>← Back</button>
          <button className="btn btn-sm" onClick={goNext}>Next →</button>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="wizard-step-card">
      <div className="wizard-step-header">
        <span className="wizard-step-icon">▶️</span>
        <div>
          <h3>Step 3 — Run the command in your terminal</h3>
          <p className="dim">Open your terminal, paste the command, and press Enter. Keep the window open.</p>
        </div>
      </div>

      <div className="wizard-step-body">
        <div className="wizard-info-box">
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>📋 How to do this</p>
          <ol className="wizard-checklist">
            <li><strong>Open your terminal</strong> — {os === 'cmd' && 'Press Win+R, type "cmd", press Enter'}{os === 'powershell' && 'Press Win+X, click "Windows PowerShell"'}{os === 'linux' && 'Press Ctrl+Alt+T'}{os === 'mac' && 'Press Cmd+Space, type "Terminal", press Enter'}</li>
            <li><strong>Paste the command</strong> — Right-click in the terminal and select "Paste" (or use Ctrl+Shift+V on Linux)</li>
            <li><strong>Press Enter</strong> — The terminal will show a connection message with your tunnel URL</li>
            <li><strong>Keep the terminal open</strong> — Your tunnel stays active only while this window is running</li>
          </ol>
        </div>

        <div className="inline-note" style={{ background: 'rgba(245,158,11,.08)', borderColor: 'rgba(245,158,11,.3)' }}>
          <span>⚠️ <strong>Don't close the terminal!</strong> If you close it, your tunnel will stop working.</span>
        </div>

        <div className="wizard-step-nav">
          <button className="btn btn-sm btn-ghost" onClick={goPrev}>← Back</button>
          <button className="btn btn-sm" onClick={goNext}>Next →</button>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="wizard-step-card">
      <div className="wizard-step-header">
        <span className="wizard-step-icon">🎉</span>
        <div>
          <h3>Step 4 — Access your tunnel!</h3>
          <p className="dim">Your tunnel is now live. Use the URL below to share your local app with anyone.</p>
        </div>
      </div>

      <div className="wizard-step-body">
        <div className="wizard-info-box">
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>🌐 Your tunnel address</p>
          {subdomain ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <a href={`https://${subdomain}.iraglobaltech.com`} target="_blank" rel="noreferrer" className="code" style={{ color: 'var(--brand)', fontWeight: 700, fontSize: '1rem' }}>
                https://{subdomain}.iraglobaltech.com
              </a>
              <button className="icon-btn" title="Copy" onClick={() => { copyToClipboard(`https://${subdomain}.iraglobaltech.com`); toast('Copied!'); }}>📋</button>
            </div>
          ) : (
            <p className="dim" style={{ fontSize: '.85rem' }}>Your subdomain will appear here once your tunnel connects. Make sure you ran the command in step 3.</p>
          )}
        </div>

        <div className="wizard-info-box">
          <p className="dim" style={{ marginBottom: '.5rem', fontWeight: 600, fontSize: '.8rem' }}>📋 What now?</p>
          <ul className="wizard-checklist" style={{ paddingLeft: '1.2rem' }}>
            <li>Open the URL in your browser — you'll see your local app live on the internet</li>
            <li>Share this URL with anyone — they can access your app from anywhere</li>
            <li>To stop the tunnel, just close the terminal window</li>
            {isPro ? (
              <li>Want a custom domain like <span className="code">myapp.com</span>? Go to <a href="/dashboard/domains" style={{ color: 'var(--brand)' }}>Manage Domains</a></li>
            ) : (
              <li>Want a custom domain? <a href="/dashboard/plan" style={{ color: 'var(--brand)' }}>Upgrade to Pro</a> for unlimited domains</li>
            )}
          </ul>
        </div>

        <div className="guide-success" style={{ width: '100%' }}>
          <span>🎉 All done! Your tunnel is ready to use.</span>
        </div>

        <div className="wizard-step-nav">
          <button className="btn btn-sm btn-ghost" onClick={goPrev}>← Back</button>
          <button className="btn btn-sm btn-ghost" onClick={resetWizard}>↺ Start over</button>
        </div>
      </div>
    </div>
  );

  const steps = [renderStep1, renderStep2, renderStep3, renderStep4];

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

      {/* Step indicator dots */}
      <div className="wizard-dots">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
          <div key={n} className={`wizard-dot ${n === currentStep ? 'active' : ''} ${n < currentStep ? 'done' : ''}`}>
            {n < currentStep ? '✓' : n}
          </div>
        ))}
      </div>

      {/* Only the current step is shown */}
      {steps[currentStep - 1]()}
    </>
  );
}