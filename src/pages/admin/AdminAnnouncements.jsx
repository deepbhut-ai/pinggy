import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { Pagination, SearchBar } from '../../components/TableControls';
import { formatBytes } from '../../utils';

// Admin: Announcements — site-wide banners + email campaigns + email logs.
// APIs: GET /announcements?active_only=false, POST /announcements,
//       PUT /announcements/{id}, DELETE /announcements/{id},
//       POST /announcements/campaign, GET /announcements/smtp-status, GET /announcements/logs

export default function AdminAnnouncements() {
  const toast = useToast();
  const [anns, setAnns] = useState([]);
  const [smtp, setSmtp] = useState(null);
  const [logs, setLogs] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [campaign, setCampaign] = useState(null); // { subject, body, audience }
  const [form, setForm] = useState({ title: '', body: '', level: 'info' });
  const [logPage, setLogPage] = useState(1);
  const [annSearch, setAnnSearch] = useState('');
  const [annPage, setAnnPage] = useState(1);
  const annPageSize = 10;

  const load = useCallback(async () => {
    try {
      const [a, s, l] = await Promise.all([
        api('/announcements?active_only=false'),
        api('/announcements/smtp-status').catch(() => null),
        api('/announcements/logs').catch(() => []),
      ]);
      setAnns(a); setSmtp(s); setLogs(l);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.title.trim() || !form.body.trim()) { toast('Title and body required', 'error'); return; }
    try {
      await api('/announcements', 'POST', form);
      toast('Announcement created');
      setForm({ title: '', body: '', level: 'info' });
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const toggle = async (a) => {
    try {
      await api(`/announcements/${a.id}`, 'PUT', { active: !a.active });
      toast(`${a.title} ${a.active ? 'hidden' : 'shown'}`);
      load(); setConfirm(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  const del = async (a) => {
    try {
      await api(`/announcements/${a.id}`, 'DELETE');
      toast(`${a.title} deleted`);
      load(); setConfirm(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  const sendCampaign = async () => {
    try {
      const r = await api('/announcements/campaign', 'POST', campaign);
      toast(r.detail || 'Campaign sent');
      setCampaign(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Announcements</div>
          <div className="page-subtitle">Site banners and email campaigns</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {smtp && (
            <span className={`badge ${smtp.configured ? 'badge-green' : ''}`}>
              SMTP {smtp.configured ? 'configured' : 'not configured'}
            </span>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      {smtp && !smtp.configured && (
        <div className="banner banner-amber" style={{ marginBottom: '1rem' }}>
          ⚠️ SMTP is not configured — emails (campaigns, 2FA codes, login alerts) fail silently. Set SMTP keys under Settings.
        </div>
      )}

      <div className="card">
        <div className="card-header"><h2>📣 New Announcement</h2></div>
        <div className="card-body">
          <div className="form-group">
            <label>Title</label>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Scheduled maintenance" />
          </div>
          <div className="form-group">
            <label>Body</label>
            <textarea rows="2" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="We'll upgrade the SSH server on…" />
          </div>
          <div className="cfg-row">
            <div className="form-group" style={{ maxWidth: 150 }}>
              <label>Level</label>
              <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="success">success</option>
              </select>
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-sm" onClick={create}>Publish</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>📧 Email Campaign</h2>
          <button className="btn btn-sm" onClick={() => setCampaign({ subject: '', body: '', audience: 'all' })}>New Campaign</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Announcements ({anns.length})</h2>
          <SearchBar value={annSearch} onChange={(v) => { setAnnSearch(v); setAnnPage(1); }} placeholder="Search title, body…" />
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {(() => {
            const q = annSearch.trim().toLowerCase();
            const filtered = q ? anns.filter((a) => (a.title || '').toLowerCase().includes(q) || (a.body || '').toLowerCase().includes(q)) : anns;
            const totalPages = Math.max(1, Math.ceil(filtered.length / annPageSize));
            const safePage = Math.min(annPage, totalPages);
            const paged = filtered.slice((safePage - 1) * annPageSize, safePage * annPageSize);
            return (
          <>
          <table>
            <thead><tr><th>Title</th><th>Level</th><th>Body</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {paged.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.title}</td>
                  <td><span className="badge">{a.level}</span></td>
                  <td className="dim" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body}</td>
                  <td><span className={`badge ${a.active ? 'badge-green' : ''}`}>{a.active ? 'Active' : 'Hidden'}</span></td>
                  <td className="dim">{String(a.created_at || '').substring(0, 10)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" onClick={() => setConfirm({ title: `${a.active ? 'Hide' : 'Show'} "${a.title}"?`, action: () => toggle(a) })}>{a.active ? '🙈' : '👁️'}</button>{' '}
                    <button className="icon-btn" onClick={() => setConfirm({ title: `Delete "${a.title}"?`, action: () => del(a) })}>🗑️</button>
                  </td>
                </tr>
              ))}
              {!paged.length && <tr><td colSpan="6" className="empty">No announcements found.</td></tr>}
            </tbody>
          </table>
          <Pagination page={safePage} totalPages={totalPages} setPage={setAnnPage} total={filtered.length} pageSize={annPageSize} />
          </>
            );
          })()}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>📬 Email Logs</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>To</th><th>Subject</th><th>Kind</th><th>Status</th><th>Error</th><th>Created</th></tr></thead>
            <tbody>
              {logs.slice((logPage - 1) * 15, logPage * 15).map((l, i) => (
                <tr key={i}>
                  <td>{l.to_email}</td>
                  <td className="dim">{l.subject}</td>
                  <td><span className="badge">{l.kind}</span></td>
                  <td><span className={`badge ${l.status === 'sent' ? 'badge-green' : ''}`} style={l.status === 'failed' ? { color: 'var(--red)' } : undefined}>{l.status}</span></td>
                  <td className="dim" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.error || '—'}</td>
                  <td className="dim">{String(l.created_at || '').substring(0, 16)}</td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan="6" className="empty">No emails sent yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {logs.length > 15 && (
          <div className="card-body" style={{ paddingTop: '.5rem' }}>
            <Pagination page={logPage} totalPages={Math.max(1, Math.ceil(logs.length / 15))} setPage={setLogPage} total={logs.length} pageSize={15} />
          </div>
        )}
      </div>

      {campaign && (
        <Modal title="Send Email Campaign" confirmLabel="Send" onConfirm={sendCampaign} onClose={() => setCampaign(null)}>
          <div className="form-group"><label>Subject</label>
            <input type="text" value={campaign.subject} onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })} /></div>
          <div className="form-group"><label>Body</label>
            <textarea rows="4" value={campaign.body} onChange={(e) => setCampaign({ ...campaign, body: e.target.value })} /></div>
          <div className="form-group"><label>Audience</label>
            <select value={campaign.audience} onChange={(e) => setCampaign({ ...campaign, audience: e.target.value })}>
              <option value="all">All users</option>
              <option value="pro">Pro users</option>
              <option value="free">Free users</option>
            </select></div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} confirmLabel="Confirm" onClose={() => setConfirm(null)}
          onConfirm={async () => { await confirm.action(); setConfirm(null); }}>
          <p className="dim">Are you sure?</p>
        </Modal>
      )}
    </>
  );
}