import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { copyToClipboard } from '../../utils';

export default function Domains() {
  const toast = useToast();
  const [domains, setDomains] = useState([]); // [{domain}]
  const [addDom, setAddDom] = useState('');

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
    try {
      // Check if domain already exists
      const tokens = await api('/tokens');
      const existingDomain = (tokens || []).some((t) =>
        t.custom_domain === domain || (t.domains || []).includes(domain)
      );
      if (existingDomain) {
        return toast('This domain is already added', 'error');
      }
      // Create a dedicated root-domain token so subdomains can be created under it
      await api('/tokens', 'POST', { name: domain, custom_domain: domain });
      toast(`${domain} added — point DNS A record to 13.140.131.204`);
      setAddDom('');
      load();
    } catch (e) { toast(e.message, 'error'); }
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
      <p className="dim" style={{ marginBottom: '1.2rem', fontSize: '.9rem' }}>Manage your root domains. Point DNS A record to 13.140.131.204.</p>

      {/* Add domain */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2>➕ Add a domain</h2></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={addDom}
              onChange={(e) => setAddDom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addDomain(); }}
              placeholder="e.g. mycompany.com"
              style={{ flex: 1, minWidth: 200 }}
            />
            <button className="btn btn-sm" onClick={addDomain}>Add</button>
          </div>
          <details style={{ marginTop: '.8rem' }}>
            <summary style={{ fontSize: '.8rem', cursor: 'pointer', fontWeight: 600 }}>📋 DNS setup (once per domain)</summary>
            <div className="dns-help" style={{ marginTop: '.5rem' }}>
              <p><strong>Step 1:</strong> Add the domain to Cloudflare → Add Site (change nameservers at your registrar)</p>
              <p><strong>Step 2:</strong> DNS A Record: Type=A, Name=@, Content=13.140.131.204, Proxy=Proxied</p>
              <p><strong>Step 3:</strong> SSL/TLS mode → Flexible</p>
              <p><strong>Step 4:</strong> Add it above — it appears in the list instantly</p>
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