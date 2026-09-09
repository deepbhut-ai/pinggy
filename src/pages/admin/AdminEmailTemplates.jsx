import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { useTableData, SearchBar, Pagination } from '../../components/TableControls';

// Admin: Email Templates + Email Config (SMTP) — two tabs.
// APIs: GET /email-templates, PUT /email-templates/{key},
//       POST /email-templates, POST /email-templates/{key}/test, DELETE /email-templates/{key},
//       GET /email-templates/smtp/config, PUT /email-templates/smtp/config,
//       POST /email-templates/smtp/test, GET /email-templates/logs

export default function AdminEmailTemplates() {
  const toast = useToast();
  const [tab, setTab] = useState('templates');

  // ---- Templates state ----
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ subject: '', body: '', is_active: true });
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ key: '', name: '', description: '', subject: '', body: '', placeholders: '' });
  const [testModal, setTestModal] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [editMode, setEditMode] = useState('code'); // 'code' | 'preview'

  // ---- SMTP config state ----
  const [smtp, setSmtp] = useState({ smtp_host: '', smtp_port: '587', smtp_user: '', smtp_password: '', smtp_from: '', smtp_enabled: false, configured: false, email_logo_url: '', email_brand_color: '#6aa6f0', email_company_name: 'IRAGT', email_footer_text: '', email_support_email: '', email_from_name: '' });
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTestModal, setSmtpTestModal] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');

  // ---- Email logs state ----
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // ---- Search + pagination for email logs ----
  const {
    search: logSearch, setSearch: setLogSearch,
    page: logPage, setPage: setLogPage,
    paged: pagedLogs, total: logTotal, totalPages: logTotalPages, pageSize: logPageSize,
  } = useTableData(logs, { searchKeys: ['to_email', 'subject', 'kind', 'status', 'error'], pageSize: 10 });

  // ---- Load templates ----
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setTemplates(await api('/email-templates'));
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ---- Load SMTP config ----
  const loadSmtp = useCallback(async () => {
    try {
      setSmtpLoading(true);
      const cfg = await api('/email-templates/smtp/config');
      setSmtp({
        smtp_host: cfg.smtp_host || '',
        smtp_port: cfg.smtp_port || '587',
        smtp_user: cfg.smtp_user || '',
        smtp_password: '',
        smtp_from: cfg.smtp_from || '',
        smtp_enabled: cfg.smtp_enabled || false,
        configured: cfg.configured || false,
        email_logo_url: cfg.email_logo_url || '',
        email_brand_color: cfg.email_brand_color || '#6aa6f0',
        email_company_name: cfg.email_company_name || 'IRAGT',
        email_footer_text: cfg.email_footer_text || '',
        email_support_email: cfg.email_support_email || '',
        email_from_name: cfg.email_from_name || '',
      });
    } catch (e) { toast(e.message, 'error'); }
    finally { setSmtpLoading(false); }
  }, [toast]);

  // ---- Load email logs ----
  const loadLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      setLogs(await api('/email-templates/logs?limit=50'));
    } catch (e) { toast(e.message, 'error'); }
    finally { setLogsLoading(false); }
  }, [toast]);

  // Load SMTP + logs when config tab opened
  useEffect(() => {
    if (tab === 'config') {
      loadSmtp();
      loadLogs();
    }
  }, [tab, loadSmtp, loadLogs]);

  // ---- Template handlers ----
  const startEdit = (t) => {
    setEditing(t.key);
    setEditForm({ subject: t.subject, body: t.body, is_active: t.is_active });
  };

  const saveEdit = async () => {
    try {
      await api(`/email-templates/${editing}`, 'PUT', editForm);
      toast(`Template "${editing}" updated`);
      setEditing(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const sendTest = async () => {
    try {
      const body = {};
      if (testEmail.trim()) body.to_email = testEmail.trim();
      const r = await api(`/email-templates/${testModal}/test`, 'POST', body);
      toast(r.detail || 'Test email sent');
      setTestModal(null);
      setTestEmail('');
    } catch (e) { toast(e.message, 'error'); }
  };

  const createTemplate = async () => {
    try {
      const body = {
        key: newForm.key.trim().toLowerCase(),
        name: newForm.name.trim(),
        description: newForm.description,
        subject: newForm.subject,
        body: newForm.body,
        placeholders: newForm.placeholders,
      };
      await api('/email-templates', 'POST', body);
      toast(`Template "${body.key}" created`);
      setCreating(false);
      setNewForm({ key: '', name: '', description: '', subject: '', body: '', placeholders: '' });
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const delTemplate = async (key) => {
    try {
      await api(`/email-templates/${key}`, 'DELETE');
      toast(`Template "${key}" deleted`);
      setConfirm(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const placeholderList = (t) => {
    if (!t.placeholders) return [];
    return t.placeholders.split(',').map(p => p.trim()).filter(Boolean);
  };

  // ---- SMTP handlers ----
  const saveSmtp = async () => {
    try {
      setSmtpSaving(true);
      const r = await api('/email-templates/smtp/config', 'PUT', {
        smtp_host: smtp.smtp_host,
        smtp_port: smtp.smtp_port,
        smtp_user: smtp.smtp_user,
        smtp_password: smtp.smtp_password, // empty = keep existing
        smtp_from: smtp.smtp_from,
        smtp_enabled: smtp.smtp_enabled,
        email_logo_url: smtp.email_logo_url,
        email_brand_color: smtp.email_brand_color,
        email_company_name: smtp.email_company_name,
        email_footer_text: smtp.email_footer_text,
        email_support_email: smtp.email_support_email,
        email_from_name: smtp.email_from_name,
      });
      toast('SMTP settings saved');
      loadSmtp();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSmtpSaving(false); }
  };

  const sendSmtpTest = async () => {
    try {
      const body = {};
      if (smtpTestEmail.trim()) body.to_email = smtpTestEmail.trim();
      const r = await api('/email-templates/smtp/test', 'POST', body);
      toast(r.detail || 'Test email sent');
      setSmtpTestModal(false);
      setSmtpTestEmail('');
      loadLogs();
    } catch (e) { toast(e.message, 'error'); }
  };

  if (loading) return <div className="loading-screen">Loading…</div>;

  return (
    <>
      {/* ---- Page header ---- */}
      <div className="page-toolbar">
        <div>
          <div className="page-title">Email System</div>
          <div className="page-subtitle">Manage email templates and SMTP configuration</div>
        </div>
        <div className="page-toolbar-actions">
          {tab === 'templates' && (
            <>
              <button className="btn btn-sm" onClick={() => setCreating(true)}>New Template</button>
              <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
            </>
          )}
          {tab === 'config' && (
            <>
              <button className="btn btn-sm" onClick={saveSmtp} disabled={smtpSaving}>{smtpSaving ? 'Saving…' : 'Save Config'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { loadSmtp(); loadLogs(); }}>Refresh</button>
            </>
          )}
        </div>
      </div>

      {/* ---- Tabs ---- */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        <button
          className={`btn btn-sm ${tab === 'templates' ? '' : 'btn-ghost'}`}
          onClick={() => setTab('templates')}
          style={{ borderRadius: 'var(--radius) var(--radius) 0 0', borderBottom: tab === 'templates' ? '2px solid var(--brand)' : '2px solid transparent' }}
        >
          Templates
        </button>
        <button
          className={`btn btn-sm ${tab === 'config' ? '' : 'btn-ghost'}`}
          onClick={() => setTab('config')}
          style={{ borderRadius: 'var(--radius) var(--radius) 0 0', borderBottom: tab === 'config' ? '2px solid var(--brand)' : '2px solid transparent' }}
        >
          Email Config
        </button>
      </div>

      {/* ============ TAB 1: TEMPLATES ============ */}
      {tab === 'templates' && (
        <div className="card">
          <div className="card-header">
            <h2>All Templates ({templates.length})</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Purpose</th>
                <th>Subject</th>
                <th>Placeholders</th>
                <th>Status</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 && (
                <tr><td colSpan={7} className="empty">No templates found.</td></tr>
              )}
              {templates.map(t => {
                const phs = placeholderList(t);
                return (
                  <tr key={t.key}>
                    <td>
                      <strong>{t.name}</strong>
                      <div className="dim" style={{ fontSize: '.78rem' }}>{t.key}</div>
                    </td>
                    <td className="dim" style={{ maxWidth: '220px', fontSize: '.82rem' }}>
                      {t.description || '—'}
                    </td>
                    <td style={{ maxWidth: '260px', fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.subject}
                    </td>
                    <td style={{ fontSize: '.78rem' }}>
                      {phs.length > 0 ? (
                        phs.map(p => (
                          <span key={p} className="badge badge-blue" style={{ marginRight: '.25rem', marginBottom: '.15rem', display: 'inline-block' }}>{`{${p}}`}</span>
                        ))
                      ) : '—'}
                    </td>
                    <td>
                      {t.is_active
                        ? <span className="badge badge-green">Active</span>
                        : <span className="badge" style={{ background: 'rgba(222,95,75,.15)', color: 'var(--red)' }}>Disabled</span>
                      }
                    </td>
                    <td>
                      {t.is_system
                        ? <span className="badge">System</span>
                        : <span className="badge badge-blue">Custom</span>
                      }
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '.25rem' }}>
                        <button className="icon-btn" title="Edit" onClick={() => startEdit(t)}>Edit</button>{' '}
                        <button className="icon-btn" title="Send test email" onClick={() => { setTestModal(t.key); setTestEmail(''); }}>Test</button>{' '}
                        {!t.is_system && (
                          <button className="icon-btn" title="Delete" onClick={() => setConfirm({ action: 'delete', template: t.key })}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ============ TAB 2: EMAIL CONFIG ============ */}
      {tab === 'config' && (
        <>
          {/* SMTP status banner */}
          <div className="card">
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              {smtp.configured ? (
                <>
                  <span className="badge badge-green" style={{ fontSize: '.85rem', padding: '.3rem .75rem' }}>SMTP Active</span>
                  <span className="dim" style={{ fontSize: '.85rem' }}>Emails are being sent through {smtp.smtp_host || 'configured SMTP server'}</span>
                </>
              ) : (
                <>
                  <span className="badge" style={{ background: 'rgba(222,95,75,.15)', color: 'var(--red)', fontSize: '.85rem', padding: '.3rem .75rem' }}>SMTP Not Configured</span>
                  <span className="dim" style={{ fontSize: '.85rem' }}>All emails (2FA codes, login alerts, welcome emails) are failing silently. Configure SMTP below to enable email delivery.</span>
                </>
              )}
            </div>
          </div>

          {/* SMTP settings */}
          <div className="card">
            <div className="card-header">
              <h2>SMTP Server Settings</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setSmtpTestModal(true)}>Send Test Email</button>
            </div>
            <div className="card-body">
              {smtpLoading ? (
                <p className="empty">Loading SMTP settings…</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.75rem' }}>
                    <div className="form-group">
                      <label>SMTP Host</label>
                      <input
                        type="text"
                        placeholder="smtp.gmail.com"
                        value={smtp.smtp_host}
                        onChange={e => setSmtp({ ...smtp, smtp_host: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>SMTP Port</label>
                      <input
                        type="text"
                        placeholder="587"
                        value={smtp.smtp_port}
                        onChange={e => setSmtp({ ...smtp, smtp_port: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                    <div className="form-group">
                      <label>SMTP Username</label>
                      <input
                        type="text"
                        placeholder="user@example.com or apikey"
                        value={smtp.smtp_user}
                        onChange={e => setSmtp({ ...smtp, smtp_user: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>SMTP Password</label>
                      <input
                        type="password"
                        placeholder="•••• (leave blank to keep current)"
                        value={smtp.smtp_password}
                        onChange={e => setSmtp({ ...smtp, smtp_password: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>From Email Address</label>
                    <input
                      type="email"
                      placeholder="noreply@iraglobaltech.com"
                      value={smtp.smtp_from}
                      onChange={e => setSmtp({ ...smtp, smtp_from: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>From Name (shown as sender name in emails)</label>
                    <input
                      type="text"
                      placeholder="IRAGT"
                      value={smtp.email_from_name}
                      onChange={e => setSmtp({ ...smtp, email_from_name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={smtp.smtp_enabled}
                        onChange={e => setSmtp({ ...smtp, smtp_enabled: e.target.checked })}
                        style={{ width: 'auto' }}
                      />
                      <span>Enable SMTP (turn on email delivery)</span>
                    </label>
                  </div>
                  <div className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>
                    Common providers: Gmail (smtp.gmail.com:587), SendGrid (smtp.sendgrid.net:587, user=apikey),
                    Mailgun (smtp.mailgun.org:587), Amazon SES (email-smtp.[region].amazonaws.com:587).
                    Use an app password for Gmail, not your regular password.
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Email Branding */}
          <div className="card">
            <div className="card-header">
              <h2>Email Branding</h2>
            </div>
            <div className="card-body">
              {smtpLoading ? (
                <p className="empty">Loading…</p>
              ) : (
                <>
                  <div className="form-group">
                    <label>Logo URL (image shown at top of every email)</label>
                    <input
                      type="text"
                      placeholder="https://iraglobaltech.com/logo.png"
                      value={smtp.email_logo_url}
                      onChange={e => setSmtp({ ...smtp, email_logo_url: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                    <div className="form-group">
                      <label>Brand Color (header background)</label>
                      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                        <input
                          type="color"
                          value={smtp.email_brand_color}
                          onChange={e => setSmtp({ ...smtp, email_brand_color: e.target.value })}
                          style={{ width: '50px', height: '38px', padding: 0, cursor: 'pointer' }}
                        />
                        <input
                          type="text"
                          value={smtp.email_brand_color}
                          onChange={e => setSmtp({ ...smtp, email_brand_color: e.target.value })}
                          style={{ flex: 1 }}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Company Name</label>
                      <input
                        type="text"
                        placeholder="IRAGT"
                        value={smtp.email_company_name}
                        onChange={e => setSmtp({ ...smtp, email_company_name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                    <div className="form-group">
                      <label>Support Email (shown in footer)</label>
                      <input
                        type="email"
                        placeholder="support@iraglobaltech.com"
                        value={smtp.email_support_email}
                        onChange={e => setSmtp({ ...smtp, email_support_email: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Footer Text</label>
                      <input
                        type="text"
                        placeholder="© 2026 IRAGT. All rights reserved."
                        value={smtp.email_footer_text}
                        onChange={e => setSmtp({ ...smtp, email_footer_text: e.target.value })}
                      />
                    </div>
                  </div>
                  {/* Live preview */}
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '.8rem', color: 'var(--text-dim)', marginBottom: '.5rem', display: 'block' }}>Preview</label>
                    <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{ background: smtp.email_brand_color || '#6aa6f0', padding: '1rem 1.5rem', textAlign: 'center' }}>
                        {smtp.email_logo_url ? (
                          <img src={smtp.email_logo_url} alt={smtp.email_company_name} style={{ maxHeight: '40px' }} />
                        ) : (
                          <span style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700 }}>{smtp.email_company_name || 'IRAGT'}</span>
                        )}
                      </div>
                      <div style={{ padding: '1.5rem', background: '#fff' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a2e', marginBottom: '.5rem' }}>Email Subject Preview</div>
                        <div style={{ fontSize: '.85rem', color: '#333', lineHeight: 1.6 }}>
                          Hi {'{name}'}, your account is ready. Run your first tunnel with a single SSH command.
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                          <span style={{ display: 'inline-block', background: smtp.email_brand_color || '#6aa6f0', color: '#fff', padding: '.5rem 1.25rem', borderRadius: '6px', fontSize: '.85rem', fontWeight: 600 }}>Get Started →</span>
                        </div>
                      </div>
                      <div style={{ padding: '.75rem 1.5rem', background: '#f8f9fa', borderTop: '1px solid #eee', fontSize: '.75rem', color: '#999' }}>
                        {smtp.email_footer_text || '© 2026 IRAGT. All rights reserved.'}
                        {smtp.email_support_email && <> · Support: {smtp.email_support_email}</>}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Email logs */}
          <div className="card">
            <div className="card-header">
              <h2>Email Logs ({logs.length})</h2>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <SearchBar value={logSearch} onChange={setLogSearch} placeholder="Search email, subject, type…" />
                <button className="btn btn-ghost btn-sm" onClick={loadLogs}>Refresh</button>
              </div>
            </div>
            {logsLoading ? (
              <div className="card-body"><p className="empty">Loading logs…</p></div>
            ) : (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>To</th>
                      <th>Subject</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Error</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLogs.length === 0 && (
                      <tr><td colSpan={6} className="empty">No emails found.</td></tr>
                    )}
                    {pagedLogs.map((l, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: '.82rem' }}>{l.to_email}</td>
                        <td style={{ maxWidth: '250px', fontSize: '.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.subject}
                        </td>
                        <td><span className="badge" style={{ fontSize: '.72rem' }}>{l.kind}</span></td>
                        <td>
                          {l.status === 'sent' ? (
                            <span className="badge badge-green">Sent</span>
                          ) : l.status === 'failed' ? (
                            <span className="badge" style={{ background: 'rgba(222,95,75,.15)', color: 'var(--red)' }}>Failed</span>
                          ) : (
                            <span className="badge">{l.status}</span>
                          )}
                        </td>
                        <td className="dim" style={{ maxWidth: '200px', fontSize: '.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.error || '—'}
                        </td>
                        <td className="dim" style={{ fontSize: '.78rem', whiteSpace: 'nowrap' }}>
                          {l.created_at ? l.created_at.replace('T', ' ').substring(0, 19) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination
                  page={logPage}
                  totalPages={logTotalPages}
                  setPage={setLogPage}
                  total={logTotal}
                  pageSize={logPageSize}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* ---- Edit modal ---- */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-box" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Edit Template — {editing}</h3>
            {(() => {
              const t = templates.find(t => t.key === editing);
              const phs = t ? placeholderList(t) : [];
              return phs.length > 0 ? (
                <div style={{ marginBottom: '.75rem', padding: '.6rem .8rem', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.82rem' }}>
                  <strong style={{ color: 'var(--text-dim)' }}>Available placeholders:</strong>{' '}
                  {phs.map(p => (
                    <code key={p} className="code" style={{ margin: '0 .2rem', color: 'var(--brand)' }}>{`{${p}}`}</code>
                  ))}
                </div>
              ) : null;
            })()}
            <div className="form-group">
              <label>Subject</label>
              <input type="text" value={editForm.subject} onChange={e => setEditForm({ ...editForm, subject: e.target.value })} placeholder="Email subject line" />
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                <label style={{ marginBottom: 0 }}>Body <span className="dim" style={{ fontSize: '.75rem' }}>(supports HTML — paste full HTML email or write simple content)</span></label>
                <div style={{ display: 'flex', gap: '.25rem' }}>
                  <button type="button" className={`btn btn-sm ${editMode === 'code' ? '' : 'btn-ghost'}`} onClick={() => setEditMode('code')} style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}>Code</button>
                  <button type="button" className={`btn btn-sm ${editMode === 'preview' ? '' : 'btn-ghost'}`} onClick={() => setEditMode('preview')} style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}>Preview</button>
                </div>
              </div>
              {editMode === 'code' && (
                <>
                  <div style={{ display: 'flex', gap: '.25rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
                    <button type="button" className="icon-btn" style={{ fontSize: '.75rem' }} onClick={() => setEditForm({ ...editForm, body: editForm.body + '\n<b>Bold text</b>' })}>Bold</button>
                    <button type="button" className="icon-btn" style={{ fontSize: '.75rem' }} onClick={() => setEditForm({ ...editForm, body: editForm.body + '\n<a href="https://example.com">Link text</a>' })}>Link</button>
                    <button type="button" className="icon-btn" style={{ fontSize: '.75rem' }} onClick={() => setEditForm({ ...editForm, body: editForm.body + '\n<img src="https://example.com/image.png" alt="Image" style="max-width:100%;border-radius:8px;">' })}>Image</button>
                    <button type="button" className="icon-btn" style={{ fontSize: '.75rem' }} onClick={() => setEditForm({ ...editForm, body: editForm.body + '\n<div style="margin:1rem 0;text-align:center;"><a href="https://example.com" style="display:inline-block;background:#6aa6f0;color:#fff;padding:.6rem 1.5rem;border-radius:6px;text-decoration:none;font-weight:600;">Button Text →</a></div>' })}>Button</button>
                    <button type="button" className="icon-btn" style={{ fontSize: '.75rem' }} onClick={() => setEditForm({ ...editForm, body: editForm.body + '\n<hr style="border:none;border-top:1px solid #eee;margin:1rem 0;">' })}>Divider</button>
                    <button type="button" className="icon-btn" style={{ fontSize: '.75rem' }} onClick={() => setEditForm({ ...editForm, body: editForm.body + '\n<h3 style="color:#1a1a2e;">Heading</h3>' })}>Heading</button>
                    <button type="button" className="icon-btn" style={{ fontSize: '.75rem' }} onClick={() => setEditForm({ ...editForm, body: editForm.body + '\n<div style="background:#f4f5f7;border-radius:8px;padding:1rem;font-family:monospace;font-size:.85rem;">code block</div>' })}>Code Block</button>
                  </div>
                  <textarea value={editForm.body} onChange={e => setEditForm({ ...editForm, body: e.target.value })} rows={14} style={{ fontFamily: 'var(--mono)', fontSize: '.82rem', resize: 'vertical' }} placeholder="Email body — use {placeholder} syntax. HTML tags supported. Paste a full HTML email to send as-is." />
                </>
              )}
              {editMode === 'preview' && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: '#fff' }}>
                  <iframe
                    srcDoc={editForm.body}
                    style={{ width: '100%', minHeight: '400px', border: 'none', display: 'block' }}
                    sandbox="allow-same-origin"
                    title="Email Preview"
                  />
                </div>
              )}
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} style={{ width: 'auto' }} />
                <span>Active (uncheck to disable this email type)</span>
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-sm" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Create template modal ---- */}
      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal-box" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">New Custom Template</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div className="form-group">
                <label>Key (unique identifier)</label>
                <input type="text" placeholder="my_template" value={newForm.key} onChange={e => setNewForm({ ...newForm, key: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Name</label>
                <input type="text" placeholder="My Custom Email" value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" placeholder="What is this email for?" value={newForm.description} onChange={e => setNewForm({ ...newForm, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Subject</label>
              <input type="text" placeholder="Email subject" value={newForm.subject} onChange={e => setNewForm({ ...newForm, subject: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Body</label>
              <textarea value={newForm.body} onChange={e => setNewForm({ ...newForm, body: e.target.value })} rows={8} style={{ fontFamily: 'var(--mono)', fontSize: '.82rem', resize: 'vertical' }} placeholder="Email body — use {placeholder} syntax" />
            </div>
            <div className="form-group">
              <label>Placeholders (comma-separated)</label>
              <input type="text" placeholder="name, email, token" value={newForm.placeholders} onChange={e => setNewForm({ ...newForm, placeholders: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn btn-sm" onClick={createTemplate}>Create Template</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Template test modal ---- */}
      {testModal && (
        <div className="modal-overlay" onClick={() => setTestModal(null)}>
          <div className="modal-box" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Send Test Email — {testModal}</h3>
            <p className="dim" style={{ fontSize: '.82rem', marginBottom: '.75rem' }}>
              A test email will be sent with sample placeholder values. Leave blank to send to your own admin email.
            </p>
            <div className="form-group">
              <label>Send to (email address)</label>
              <input type="email" placeholder="your email (blank = your admin email)" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setTestModal(null)}>Cancel</button>
              <button className="btn btn-sm" onClick={sendTest}>Send Test</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- SMTP test modal ---- */}
      {smtpTestModal && (
        <div className="modal-overlay" onClick={() => setSmtpTestModal(false)}>
          <div className="modal-box" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">SMTP Test Email</h3>
            <p className="dim" style={{ fontSize: '.82rem', marginBottom: '.75rem' }}>
              Send a plain test email through your configured SMTP server to verify the connection works.
            </p>
            <div className="form-group">
              <label>Send to (email address)</label>
              <input type="email" placeholder="your email (blank = your admin email)" value={smtpTestEmail} onChange={e => setSmtpTestEmail(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setSmtpTestModal(false)}>Cancel</button>
              <button className="btn btn-sm" onClick={sendSmtpTest}>Send Test</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Confirm delete modal ---- */}
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal-box" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Delete Template</h3>
            <p style={{ fontSize: '.9rem', color: 'var(--text-dim)' }}>
              {`Delete custom template "${confirm.template}"? This action cannot be undone.`}
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => delTemplate(confirm.template)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}