import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

export default function Support() {
  const toast = useToast();
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openTicket, setOpenTicket] = useState(null); // full ticket with messages
  const [reply, setReply] = useState('');
  const [activeFaq, setActiveFaq] = useState(null);

  const load = useCallback(() => api('/tickets/my').then(setTickets).catch(() => {}), []);

  useEffect(() => {
    load();
    if (user?.email) {
      setEmail(user.email);
    }
  }, [load, user]);

  const badge = (s) =>
    s === 'open' ? (
      <span className="badge badge-red">open</span>
    ) : s === 'answered' ? (
      <span className="badge badge-green">answered</span>
    ) : (
      <span className="badge">closed</span>
    );

  const create = async (e) => {
    e.preventDefault();
    if (!email.trim() || !message.trim()) return toast('Please fill in your email and message', 'error');

    setSubmitting(true);
    try {
      const details = [];
      if (firstName.trim() || lastName.trim()) details.push(`Name: ${firstName.trim()} ${lastName.trim()}`.trim());
      if (email.trim()) details.push(`Email: ${email.trim()}`);
      if (contactNumber.trim()) details.push(`Contact: ${contactNumber.trim()}`);

      const fullMessage = details.length > 0
        ? `${details.join(' | ')}\n\n${message.trim()}`
        : message.trim();

      const finalSubject = subject.trim() || `Help Request from ${firstName.trim() || email.trim()}`;

      const endpoint = user ? '/tickets' : '/tickets/public';
      const t = await api(endpoint, 'POST', JSON.stringify({
        subject: finalSubject,
        message: fullMessage,
        email: email.trim(),
      }));
      toast('Request submitted successfully! Our team will contact you shortly.');
      setMessage('');
      setContactNumber('');
      if (user) {
        load();
        if (t?.id) openTicketModal(t.id);
      }
    } catch (e2) {
      toast(e2.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openTicketModal = async (id) => {
    try {
      const t = await api(`/tickets/${id}`);
      setOpenTicket(t);
      setReply('');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return toast('Write a message first', 'error');
    try {
      await api(`/tickets/${openTicket.id}/reply`, 'POST', JSON.stringify({ message: reply.trim() }));
      toast('Reply sent');
      openTicketModal(openTicket.id);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const close = async (id, fromModal = false) => {
    try {
      await api(`/tickets/${id}/close`, 'POST');
      toast('Ticket closed');
      if (fromModal) setOpenTicket(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const faqs = [
    {
      q: 'How do I start an SSH tunnel?',
      a: 'Run `ssh -p 2222 -R0:localhost:8080 <YOUR_TOKEN>@ssh.iraglobaltech.com` in your terminal. Your public URL will be printed immediately.',
    },
    {
      q: 'What is the difference between Subdomain and Domain?',
      a: 'A Subdomain provides a fast *.iraglobaltech.com URL (e.g. myapp.iraglobaltech.com). A Custom Domain allows pointing your own domain (e.g. api.yourcompany.com) via DNS A record.',
    },
    {
      q: 'How do I connect multiple local ports on one tunnel?',
      a: 'Use multi-port syntax in your SSH username: `TOKEN--3000,8000,5173`. Each remote listener maps in order to your token\'s addresses.',
    },
    {
      q: 'How does Token Security work?',
      a: 'You can enforce Basic Auth (username:password), IP Whitelisting, Bearer API keys, or HTTPS-only mode directly in Manage Tokens → Edit.',
    },
  ];

  return (
    <div className="help-center-page">
      {/* ─── HERO SECTION ─── */}
      <div className="help-hero-banner">
        <h1 className="help-hero-title">
          HELP <span className="help-hero-outline">CENTER</span> <span className="help-hero-accent">SUPPORT</span>
        </h1>
        <p className="help-hero-sub">
          Need help? Submit your request below, explore quick resources, or track your active tickets.
        </p>
      </div>

      {/* ─── SUBMIT REQUEST FORM (CALLINGAGENTS STYLE) ─── */}
      <div className="help-form-card">
        <div className="help-card-header">
          <h2>Submit Your Request</h2>
          <p className="dim">Please provide your details and issue description below.</p>
        </div>

        <form onSubmit={create}>
          <div className="help-form-row">
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>

          <div className="form-group">
            <label>Contact Number</label>
            <input
              type="tel"
              required
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="+1 234 567 8900"
            />
          </div>

          <div className="form-group">
            <label>Message</label>
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help you?"
            />
          </div>

          <button type="submit" className="btn-help-submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Request →'}
          </button>
        </form>
      </div>

      {/* ─── MY TICKETS SECTION ─── */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-header">
          <div>
            <div className="section-label">Support History</div>
            <h2>🎫 My Tickets <span className="token-meta">({tickets.length})</span></h2>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={load}>🔄 Refresh</button>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {tickets.length === 0 ? (
            <p className="empty">No tickets yet. Submit a request above if you need assistance.</p>
          ) : (
            <table style={{ fontSize: '.85rem' }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => openTicketModal(t.id)}>
                    <td style={{ fontWeight: 600 }}>{t.subject}</td>
                    <td>{badge(t.status)}</td>
                    <td className="dim">{new Date(t.updated_at).toLocaleString()}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          openTicketModal(t.id);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── FAQ ACCORDION ─── */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-header">
          <h2>❓ Frequently Asked Questions</h2>
        </div>
        <div className="card-body">
          <div className="faq-list">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className={`faq-item ${activeFaq === idx ? 'open' : ''}`}
                onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
              >
                <div className="faq-question">
                  <span>{faq.q}</span>
                  <span className="faq-arrow">{activeFaq === idx ? '▲' : '▼'}</span>
                </div>
                {activeFaq === idx && (
                  <div className="faq-answer">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── CONVERSATION MODAL ─── */}
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
                      padding: '.6rem .8rem',
                      borderRadius: 'var(--radius)',
                      background: m.is_staff ? 'rgba(170,255,0,.08)' : 'var(--bg)',
                      border: m.is_staff ? '1px solid rgba(170,255,0,.25)' : '1px solid var(--border)',
                    }}
                  >
                    <div className="dim" style={{ fontSize: '.72rem', marginBottom: '.25rem', color: m.is_staff ? 'var(--green)' : 'var(--text-dim)' }}>
                      {m.is_staff ? '🛟 Support Team' : m.sender} · {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                    </div>
                    <div style={{ fontSize: '.85rem', whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  </div>
                ))}
              </div>
              {openTicket.status !== 'closed' ? (
                <div style={{ marginTop: '.8rem' }}>
                  <textarea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply…"
                  />
                  <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '.5rem' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => close(openTicket.id, true)}>
                      Close ticket
                    </button>
                    <button className="btn btn-sm" onClick={sendReply}>
                      Send reply
                    </button>
                  </div>
                </div>
              ) : (
                <p className="empty" style={{ marginTop: '.8rem' }}>This ticket is closed.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}