import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';

// Support — tickets with conversation modal, reply, close (like legacy)
export default function Support() {
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [openTicket, setOpenTicket] = useState(null); // full ticket with messages
  const [reply, setReply] = useState('');

  const load = useCallback(() => api('/tickets/my').then(setTickets).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const badge = (s) => s === 'open'
    ? <span className="badge badge-red">open</span>
    : s === 'answered'
      ? <span className="badge badge-green">answered</span>
      : <span className="badge">closed</span>;

  const create = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return toast('Fill in subject and message', 'error');
    try {
      const t = await api('/tickets', 'POST', JSON.stringify({ subject: subject.trim(), message: message.trim() }));
      toast('Ticket submitted — we\u2019ll reply soon');
      setSubject(''); setMessage('');
      load();
      openTicketModal(t.id);
    } catch (e2) { toast(e2.message, 'error'); }
  };

  const openTicketModal = async (id) => {
    try {
      const t = await api(`/tickets/${id}`);
      setOpenTicket(t);
      setReply('');
    } catch (e) { toast(e.message, 'error'); }
  };

  const sendReply = async () => {
    if (!reply.trim()) return toast('Write a message first', 'error');
    try {
      await api(`/tickets/${openTicket.id}/reply`, 'POST', JSON.stringify({ message: reply.trim() }));
      toast('Reply sent');
      openTicketModal(openTicket.id);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const close = async (id, fromModal = false) => {
    try {
      await api(`/tickets/${id}/close`, 'POST');
      toast('Ticket closed');
      if (fromModal) setOpenTicket(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <h2 style={{ marginBottom: '1rem' }}>Support</h2>
      <p className="dim" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>Stuck? Open a ticket — our team replies right here in your dashboard</p>

      <form className="card" onSubmit={create}>
        <div className="card-header"><h2>Open a Ticket</h2></div>
        <div className="card-body">
          <div className="form-group">
            <label>Subject</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. TCP tunnel keeps dropping" />
          </div>
          <div className="form-group" style={{ marginTop: '.8rem' }}>
            <label>Message</label>
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe the issue — include your subdomain if relevant" />
          </div>
          <button type="submit" className="btn btn-sm" style={{ marginTop: '.8rem' }}>Submit ticket</button>
        </div>
      </form>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2>🎫 My Tickets ({tickets.length})</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {tickets.length === 0 ? (
            <p className="empty">No tickets yet.</p>
          ) : (
            <table style={{ fontSize: '.85rem' }}>
              <thead><tr><th>Subject</th><th>Status</th><th>Updated</th><th style={{ width: 80 }}></th></tr></thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => openTicketModal(t.id)}>
                    <td>{t.subject}</td>
                    <td>{badge(t.status)}</td>
                    <td className="dim">{new Date(t.updated_at).toLocaleString()}</td>
                    <td>
                      {t.status !== 'closed' && (
                        <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); close(t.id); }}>Close</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Conversation modal */}
      {openTicket && (
        <div className="modal-overlay" onClick={() => setOpenTicket(null)}>
          <div className="modal-box modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">🎫 {openTicket.subject}</h3>
            <div className="modal-body">
              <div style={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                {(openTicket.messages || []).map((m, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '.6rem .8rem', borderRadius: 'var(--radius)',
                      background: m.is_staff ? 'rgba(106,166,240,.1)' : 'var(--bg)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="dim" style={{ fontSize: '.72rem', marginBottom: '.25rem' }}>
                      {m.is_staff ? '🛟 IRAGT Support' : m.sender} · {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                    </div>
                    <div style={{ fontSize: '.85rem', whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  </div>
                ))}
              </div>
              {openTicket.status !== 'closed' ? (
                <div style={{ marginTop: '.8rem' }}>
                  <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
                  <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '.5rem' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => close(openTicket.id, true)}>Close ticket</button>
                    <button className="btn btn-sm" onClick={sendReply}>Send reply</button>
                  </div>
                </div>
              ) : (
                <p className="empty" style={{ marginTop: '.8rem' }}>This ticket is closed.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}