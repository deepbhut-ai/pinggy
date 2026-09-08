import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { SearchBar, Pagination } from '../../components/TableControls';

// Admin: Tickets — support tickets from all users.
// APIs: GET /tickets/admin/all[?status=], GET /tickets/{id},
//       POST /tickets/{id}/reply { message }, POST /tickets/{id}/close

const STATUS_BADGE = { open: '', answered: 'badge-green', closed: '' };

export default function AdminTickets() {
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);   // { ticket, reply }
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      const q = filter === 'all' ? '' : `?status=${filter}`;
      setTickets(await api(`/tickets/admin/all${q}`));
    } catch (e) { toast(e.message, 'error'); }
  }, [toast, filter]);

  useEffect(() => { load(); }, [load]);

  const open = async (id) => {
    try {
      const t = await api(`/tickets/${id}`);
      setDetail({ ticket: t, reply: '' });
    } catch (e) { toast(e.message, 'error'); }
  };

  const sendReply = async () => {
    const { ticket, reply } = detail;
    if (!reply.trim()) { toast('Write a reply first', 'error'); return; }
    try {
      // NOTE: legacy panel double-stringified this body (bug) — we send plain JSON
      await api(`/tickets/${ticket.id}/reply`, 'POST', { message: reply.trim() });
      toast('Reply sent');
      open(ticket.id); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const close = async (id) => {
    try {
      await api(`/tickets/${id}/close`, 'POST');
      toast('Ticket closed');
      setDetail(null); setConfirm(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const q = search.trim().toLowerCase();
  const filtered = q ? tickets.filter((t) =>
    (t.user_email || '').toLowerCase().includes(q) || (t.subject || '').toLowerCase().includes(q)
  ) : tickets;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Tickets ({tickets.length})</div>
          <div className="page-subtitle">Support requests from all users</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {['all', 'open', 'answered', 'closed'].map((f) => (
            <button key={f} className={`btn btn-sm ${filter === f ? '' : 'btn-ghost'}`} onClick={() => { setFilter(f); setPage(1); }}>{f}</button>
          ))}
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search…" style={{ maxWidth: 160 }} />
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>User</th><th>Subject</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {paged.map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => open(t.id)}>
                  <td>{t.user_email}</td>
                  <td style={{ fontWeight: 600 }}>{t.subject}</td>
                  <td><span className={`badge ${STATUS_BADGE[t.status] || ''}`} style={t.status === 'open' ? { color: 'var(--red)' } : undefined}>{t.status}</span></td>
                  <td className="dim">{String(t.updated_at || '').substring(0, 16)}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan="4" className="empty">No tickets.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card-body" style={{ paddingTop: '.5rem' }}>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} total={filtered.length} pageSize={pageSize} />
        </div>
      </div>

      {detail && (
        <Modal title={detail.ticket.subject} confirmLabel={detail.ticket.status === 'closed' ? 'Close' : 'Send Reply'}
          onConfirm={detail.ticket.status === 'closed' ? () => setDetail(null) : sendReply}
          onClose={() => setDetail(null)}>
          <p className="dim" style={{ fontSize: '.82rem', marginBottom: '.75rem' }}>
            From <strong style={{ color: 'var(--text)' }}>{detail.ticket.user_email}</strong> · status: {detail.ticket.status}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', marginBottom: '1rem', maxHeight: 260, overflowY: 'auto' }}>
            {(detail.ticket.messages || []).map((m, i) => (
              <div key={i} style={{
                padding: '.6rem .75rem', borderRadius: 'var(--radius)',
                background: m.is_staff ? 'var(--brand-light)' : 'var(--surface-1)',
                border: '1px solid var(--border)', alignSelf: m.is_staff ? 'flex-end' : 'flex-start', maxWidth: '85%',
              }}>
                <div style={{ fontSize: '.72rem', color: 'var(--text-dim)', marginBottom: '.25rem' }}>
                  {m.is_staff ? '🛟 Staff' : m.sender} · {String(m.created_at || '').substring(0, 16)}
                </div>
                <div style={{ fontSize: '.85rem', whiteSpace: 'pre-wrap' }}>{m.body}</div>
              </div>
            ))}
          </div>

          {detail.ticket.status !== 'closed' && (
            <>
              <div className="form-group" style={{ marginBottom: '.5rem' }}>
                <label>Reply as staff</label>
                <textarea rows="3" value={detail.reply}
                  onChange={(e) => setDetail({ ...detail, reply: e.target.value })}
                  placeholder="Type your reply…" />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ title: 'Close this ticket?', action: () => close(detail.ticket.id) })}>
                Close ticket
              </button>
            </>
          )}
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