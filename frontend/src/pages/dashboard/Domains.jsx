import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { copyToClipboard } from '../../utils';

export default function Domains() {
  const toast = useToast();
  const [tokens, setTokens] = useState([]);
  const [addDom, setAddDom] = useState('');
  const [addTok, setAddTok] = useState('');
  const [addType, setAddType] = useState('extra');
  const [removeModal, setRemoveModal] = useState(null); // domain

  const load = useCallback(() => api('/tokens').then(setTokens).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!addTok && tokens.length) setAddTok(tokens[0].id);
  }, [tokens, addTok]);

  const myOwn = tokens.filter((t) => !t.via_team || t.via_team.owner);

  const addDomain = async () => {
    const domain = addDom.trim().toLowerCase();
    if (!domain) return toast('Enter a domain first', 'error');
    try {
      if (addType === 'primary') {
        await api(`/users/me/custom-domain?custom_domain=${encodeURIComponent(domain)}&token_id=${encodeURIComponent(addTok)}`, 'PUT');
        toast(`${domain} is now the primary domain — point its A record at 13.140.131.204`);
      } else {
        await api(`/tokens/${addTok}/domains`, 'POST', JSON.stringify({ domain }));
        toast(`${domain} attached — point its A record at 13.140.131.204`);
      }
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const removePrimary = async () => {
    try {
      await api(`/users/me/custom-domain?custom_domain=&token_id=`, 'PUT');
      toast(`${removeModal} removed from the system`);
      setRemoveModal(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const removeExtra = async (domain, tokenId) => {
    try {
      await api(`/tokens/${tokenId}/domains/${domain}`, 'DELETE');
      toast(`${domain} removed from the system`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <h2 style={{ marginBottom: '.4rem' }}>Domains</h2>

      {/* Add domain */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2>➕ Add a domain</h2></div>
        <div className="card-body">
          {myOwn.length ? (
            <>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={addDom}
                  onChange={(e) => setAddDom(e.target.value)}
                  placeholder="e.g. api.mycompany.com"
                  style={{ flex: 1, minWidth: 200 }}
                />
                <select value={addTok} onChange={(e) => setAddTok(e.target.value)} style={{ width: 'auto', maxWidth: 220 }}>
                  {myOwn.map((t) => <option key={t.id} value={t.id}>{t.name || t.token.slice(0, 12)}</option>)}
                </select>
                <select value={addType} onChange={(e) => setAddType(e.target.value)} style={{ width: 'auto' }}>
                  <option value="extra">Subdomain — e.g. api.yourdomain.com (unlimited on Pro)</option>
                  <option value="primary">Primary domain — your 1 main domain (Pro)</option>
                </select>
                <button className="btn btn-sm" onClick={addDomain}>Add</button>
              </div>
              <details style={{ marginTop: '.8rem' }}>
                <summary style={{ fontSize: '.8rem', cursor: 'pointer', fontWeight: 600 }}>📋 DNS setup (once per domain)</summary>
                <div className="dns-help" style={{ marginTop: '.5rem' }}>
                  <p><strong>Step 1:</strong> Add the domain to Cloudflare → Add Site (change nameservers at your registrar)</p>
                  <p><strong>Step 2:</strong> DNS A Record: Type=A, Name=@, Content=13.140.131.204, Proxy=Proxied</p>
                  <p><strong>Step 3:</strong> SSL/TLS mode → Flexible</p>
                  <p><strong>Step 4:</strong> Add it above — it appears in the domain entries instantly</p>
                </div>
              </details>
            </>
          ) : (
            <p className="empty">No tokens yet — create one in Manage Tokens first.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2>Domain entries</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ fontSize: '.85rem' }}>
            <thead><tr><th>Type</th><th>Domain</th><th style={{ width: 130 }}></th></tr></thead>
            <tbody>
              {myOwn.flatMap((t) => [
                ...(t.custom_domain ? [{ domain: t.custom_domain, type: 'Primary domain', badge: 'badge-blue', remove: () => setRemoveModal(t.custom_domain) }] : []),
                ...(t.domains || []).map((domain) => ({ domain, type: 'Extra domain', badge: 'badge-green', remove: () => removeExtra(domain, t.id) })),
              ]).map((entry) => (
                <tr key={entry.domain}>
                  <td><span className={`badge ${entry.badge}`}>{entry.type}</span></td>
                  <td className="code" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                    https://{entry.domain}
                    <button className="icon-btn" title="Copy" onClick={() => { copyToClipboard(`https://${entry.domain}`); toast('Copied'); }}>📋</button>
                  </td>
                  <td><button className="btn btn-sm btn-danger" onClick={entry.remove}>Remove</button></td>
                </tr>
              ))}
              {!myOwn.some((t) => t.custom_domain || (t.domains || []).length) && (
                <tr><td colSpan="3" className="empty">No domains added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remove primary domain modal */}
      {removeModal && (
        <Modal
          title={`Remove ${removeModal}?`}
          confirmLabel="Remove"
          onConfirm={removePrimary}
          onClose={() => setRemoveModal(null)}
        >
          <p className="dim" style={{ fontSize: '.85rem' }}>
            The domain is removed from this token <strong>and your whole account</strong>. Your DNS record at the registrar stays until you remove it there.
          </p>
        </Modal>
      )}
    </>
  );
}