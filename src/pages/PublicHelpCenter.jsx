import { useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { Link } from 'react-router-dom';

export default function PublicHelpCenter() {
  const toast = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanContact = contactNumber.trim();
    const cleanMessage = message.trim();
    const namePattern = /^[\p{L}][\p{L}\p{M} .'-]{1,49}$/u;
    const phonePattern = /^\+?[0-9][0-9 ()-]{6,19}$/;

    if (!namePattern.test(cleanFirstName)) return toast('Enter a valid first name (2–50 characters)', 'error');
    if (!namePattern.test(cleanLastName)) return toast('Enter a valid last name (2–50 characters)', 'error');
    if (!e.currentTarget.elements.email.checkValidity()) return toast('Enter a valid email address', 'error');
    if (!phonePattern.test(cleanContact)) return toast('Enter a valid contact number (7–20 digits/characters)', 'error');
    if (cleanMessage.length < 10) return toast('Message must be at least 10 characters', 'error');
    if (cleanMessage.length > 2000) return toast('Message cannot exceed 2,000 characters', 'error');

    setSubmitting(true);
    try {
      const details = [];
      details.push(`Name: ${cleanFirstName} ${cleanLastName}`);
      details.push(`Email: ${cleanEmail}`);
      details.push(`Contact: ${cleanContact}`);

      const fullMessage = `${details.join(' | ')}\n\n${cleanMessage}`;

      const finalSubject = `Help Request from ${cleanFirstName}`;

      await api('/tickets/public', 'POST', JSON.stringify({
        subject: finalSubject,
        message: fullMessage,
        email: cleanEmail,
      }));

      toast('🎉 Your request has been submitted! Our support team will reach out shortly.');
      setFirstName('');
      setLastName('');
      setEmail('');
      setContactNumber('');
      setMessage('');
    } catch (err) {
      toast(err.message || 'Failed to submit request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const faqs = [
    {
      q: 'How do I start an SSH tunnel without installing anything?',
      a: 'Simply run `ssh -p 2222 -R0:localhost:8080 <YOUR_TOKEN>@ssh.iraglobaltech.com` in any terminal (macOS, Linux, Windows Powershell). Your live tunnel URL will be printed immediately.',
    },
    {
      q: 'Can I use my own custom domain?',
      a: 'Yes! Pro plans allow attaching unlimited custom domains. Add a DNS A record pointing `@` to `13.140.131.204` with Cloudflare Flexible SSL, and add it in the Domains dashboard.',
    },
    {
      q: 'What is the difference between Subdomain and Domain?',
      a: 'A Subdomain gives you a permanent *.iraglobaltech.com URL (e.g. myapp.iraglobaltech.com). A Custom Domain allows you to use your own root domain or custom branded address (e.g. api.mycompany.com).',
    },
    {
      q: 'Can I protect my tunnel with passwords or IP restrictions?',
      a: 'Yes! You can configure HTTP Basic Auth, IP Whitelisting, Bearer API Key authentication, or HTTPS-only enforcement from Manage Tokens → Edit.',
    },
  ];

  return (
    <div className="public-help-page">
      {/* ─── PUBLIC NAVBAR ─── */}
      <nav className="public-nav">
        <div className="public-nav-brand">
          <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>IRAGT</span>
          </a>
        </div>

        <ul className="public-nav-links">
          <li><a href="/#features">Features</a></li>
          <li><a href="/#how">How It Works</a></li>
        </ul>

        <div className="public-nav-actions">
          <Link to="/login" className="btn">Get Started</Link>
        </div>

        <button
          className={`public-hamburger ${mobileMenuOpen ? 'open' : ''}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </nav>

      {/* ─── MOBILE DRAWER ─── */}
      {mobileMenuOpen && (
        <div className="public-mobile-drawer">
          <ul className="public-mobile-links">
            <li><a href="/#features" onClick={() => setMobileMenuOpen(false)}>Features</a></li>
            <li><a href="/#how" onClick={() => setMobileMenuOpen(false)}>How It Works</a></li>
          </ul>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginTop: '1.5rem' }}>
            <Link to="/login" className="btn" style={{ textAlign: 'center' }}>Get Started</Link>
          </div>
        </div>
      )}

      {/* ─── HERO SECTION ─── */}
      <section className="help-hero">
        <h1>
          HELP<span className="outline">CENTER</span> <span className="green">SUPPORT</span>
        </h1>
        <p>
          Get help with SSH tunnels, custom domains, access tokens, and your IRAGT account.
        </p>
      </section>

      {/* ─── HELP FORM SECTION ─── */}
      <section className="help-section">
        <div className="help-card">
          <h2>Submit Your Request</h2>
          <p>Please provide your details below.</p>

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>First Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={50}
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={50}
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                name="email"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Contact Number</label>
              <input
                type="tel"
                required
                minLength={7}
                maxLength={20}
                autoComplete="tel"
                inputMode="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Message</label>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="form-hint">{message.length}/2000 characters · minimum 10</div>
            </div>

            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Request →'}
            </button>
          </form>
        </div>

        {/* ─── FAQ ACCORDION ─── */}
        <div className="help-card" style={{ marginTop: '2.5rem' }}>
          <h2>❓ Frequently Asked Questions</h2>
          <div className="faq-list" style={{ marginTop: '1.25rem' }}>
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
      </section>

      {/* ─── LANDING-PAGE FOOTER ─── */}
      <footer className="public-footer">
        <p>Powered by SSH &amp; Cloudflare · <a href="/docs">API Docs</a> · <a href="/">IRAGT Home</a></p>
      </footer>
    </div>
  );
}
