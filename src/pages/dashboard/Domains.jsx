import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { copyToClipboard } from '../../utils';

const SERVER_IP = '13.140.131.204';

export default function Domains() {
  const toast = useToast();
  const [domains, setDomains] = useState([]); // [{domain}]
  const [addDom, setAddDom] = useState('');
  const [pending, setPending] = useState(null); // {domain} — entered, not yet verified
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null); // {status, message}

  // Extract root domain from any host: e.g. bedrive.callingagents.in → callingagents.in
  const rootDomain = (host) => {
    if (!host) return '';
    const parts = host.replace(/^https?:\/\//, '').split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    // Handle two-part TLDs like .co.uk, .com.br
    const twoPartTld = /^(com|co|net|org|gov|edu|ac)\.[a-z]{2}$/i.test(parts.slice(-2).join('.'));
    return twoPartTld ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
  };

  const load = useCallback(() => {
    api('/tokens').then((tokens) => {
      const allDomains = [];
      (tokens || []).forEach((t) => {
        if (t.custom_domain) allDomains.push({ domain: t.custom_domain, token_id: t.id, type: 'primary' });
        (t.domains || []).forEach((d) => allDomains.push({ domain: d, token_id: t.id, type: 'extra' }));
      });
      // Extract unique root domains only (filter out subdomains)
      const rootDomains = [...new Set(allDomains.map((d) => rootDomain(d.domain)).filter(Boolean))];
      setDomains(rootDomains.map((r) => ({ domain: r })));
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const addDomain = async () => {
    const domain = addDom.trim().toLowerCase();
    if (!domain) return toast('Enter a domain first', 'error');
    // Validate it's a root domain (not a subdomain)
    const root = rootDomain(domain);
    if (root !== domain) {
      return toast('Please enter a root domain only (e.g. mycompany.com, not sub.mycompany.com)', 'error');
    }
    // Check if domain already exists
    const tokens = await api('/tokens');
    const existingDomain = (tokens || []).some((t) =>
      t.custom_domain === domain || (t.domains || []).includes(domain)
    );
    if (existingDomain) {
      return toast('This domain is already added', 'error');
    }
    // Don't save yet — show DNS instructions + Verify button
    setPending({ domain });
    setVerifyResult(null);
    toast(`${domain} entered — configure DNS, then click Verify & Save`);
  };

  const verifyAndSave = async () => {
    if (!pending) return;
    const { domain } = pending;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await api(`/users/me/verify-domain?domain=${encodeURIComponent(domain)}`);
      if (res.status === 'ok') {
        // DNS verified — create the root-domain token
        await api('/tokens', 'POST', { name: domain, custom_domain: domain });
        setVerifyResult({ status: 'ok', message: res.message });
        toast(`🎉 ${domain} verified and saved!`);
        setPending(null);
        setAddDom('');
        setTimeout(() => load(), 1500);
      } else {
        setVerifyResult({ status: 'error', message: res.message || 'Verification failed' });
      }
    } catch (e) {
      setVerifyResult({ status: 'error', message: e.message });
    } finally {
      setVerifying(false);
    }
  };

  const cancelPending = () => {
    setPending(null);
    setVerifyResult(null);
    setAddDom('');
  };

  const removeDomain = async (rootDomainToRemove) => {
    try {
      const tokens = await api('/tokens');
      // Find all domains (primary + extra) that match this root domain
      const domainsToRemove = [];
      (tokens || []).forEach((t) => {
        if (t.custom_domain && rootDomain(t.custom_domain) === rootDomainToRemove) {
          domainsToRemove.push({ domain: t.custom_domain, tokenId: t.id, type: 'primary' });
        }
        (t.domains || []).forEach((d) => {
          if (rootDomain(d) === rootDomainToRemove) {
            domainsToRemove.push({ domain: d, tokenId: t.id, type: 'extra' });
          }
        });
      });
      // Remove all matching domains
      for (const d of domainsToRemove) {
        if (d.type === 'primary') {
          await api(`/users/me/custom-domain?custom_domain=&token_id=${encodeURIComponent(d.tokenId)}`, 'PUT');
        } else {
          await api(`/tokens/${d.tokenId}/domains/${encodeURIComponent(d.domain)}`, 'DELETE');
        }
      }
      toast(`${rootDomainToRemove} removed`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <h2 style={{ marginBottom: '.4rem' }}>Domains</h2>
      <p className="dim" style={{ marginBottom: '1.2rem', fontSize: '.9rem' }}>Manage your root domains. Point DNS A record to {SERVER_IP}.</p>

      {/* Add domain */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2>➕ Add a domain</h2></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={addDom}
              onChange={(e) => setAddDom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !pending) addDomain(); }}
              placeholder="e.g. mycompany.com"
              style={{ flex: 1, minWidth: 200 }}
            />
            <button className="btn btn-sm" onClick={addDomain} disabled={!!pending}>Add</button>
          </div>

          {/* DNS setup + Verify panel (shown after Add, before save) */}
          {pending && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.85rem', lineHeight: 1.7 }}>
              <p style={{ fontWeight: 700, marginBottom: '.6rem' }}>🌐 Configure DNS for <code>{pending.domain}</code></p>
              <p style={{ marginBottom: '.4rem' }}>Add a DNS <strong>A record</strong> in your domain provider (Cloudflare, GoDaddy, etc.):</p>
              <table className="table" style={{ fontSize: '.8rem', marginBottom: '.6rem' }}>
                <tbody>
                  <tr><td><strong>Type</strong></td><td>A</td></tr>
                  <tr><td><strong>Name</strong></td><td>@</td></tr>
                  <tr><td><strong>Content / Target IP</strong></td><td><code>{SERVER_IP}</code></td></tr>
                  <tr><td><strong>Proxy</strong></td><td>Proxied (if Cloudflare)</td></tr>
                  <tr><td><strong>SSL/TLS</strong></td><td>Flexible</td></tr>
                </tbody>
              </table>
              <p style={{ marginBottom: '.8rem', color: 'var(--text-dim)' }}>DNS propagation usually takes 1–5 minutes. Once done, click Verify below.</p>
              {verifyResult && (
                <p style={{ marginBottom: '.6rem', fontWeight: 600, color: verifyResult.status === 'ok' ? 'var(--green)' : 'var(--red)' }}>
                  {verifyResult.status === 'ok' ? '🎉 ' : '⚠️ '}{verifyResult.message}
                </p>
              )}
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="btn btn-sm" onClick={verifyAndSave} disabled={verifying}>
                  {verifying ? 'Verifying...' : 'Verify & Save'}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={cancelPending}>Cancel</button>
              </div>
            </div>
          )}

          <details style={{ marginTop: '.8rem' }}>
            <summary style={{ fontSize: '.8rem', cursor: 'pointer', fontWeight: 600 }}>📋 DNS setup (once per domain)</summary>
            <div className="dns-help" style={{ marginTop: '.5rem' }}>
              <p><strong>Step 1:</strong> Add the domain to Cloudflare → Add Site (change nameservers at your registrar)</p>
              <p><strong>Step 2:</strong> DNS A Record: Type=A, Name=@, Content={SERVER_IP}, Proxy=Proxied</p>
              <p><strong>Step 3:</strong> SSL/TLS mode → Flexible</p>
              <p><strong>Step 4:</strong> Enter domain above and click Add</p>
            </div>
          </details>
        </div>
      </div>

      <h3 style={{ marginTop: '1.5rem', marginBottom: '.5rem' }}>Your domains ({domains.length})</h3>
      {domains.length ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ fontSize: '.85rem' }}>
              <thead><tr><th>Domain</th><th style={{ width: 100 }}></th></tr></thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.domain}>
                    <td className="code" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                      https://{d.domain}
                      <button className="icon-btn" title="Copy" onClick={() => { copyToClipboard(`https://${d.domain}`); toast('Copied'); }}>📋</button>
                    </td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => removeDomain(d.domain)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
            <p className="empty">No domains added yet.</p>
          </div>
        </div>
      )}
    </>
  );
}