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
    if (!email.trim() || !message.trim()) {
      return toast('Please provide your email and message', 'error');
    }

    setSubmitting(true);
    try {
      const details = [];
      if (firstName.trim() || lastName.trim()) details.push(`Name: ${firstName.trim()} ${lastName.trim()}`.trim());
      if (email.trim()) details.push(`Email: ${email.trim()}`);
      if (contactNumber.trim()) details.push(`Contact: ${contactNumber.trim()}`);

      const fullMessage = details.length > 0
        ? `${details.join(' | ')}\n\n${message.trim()}`
        : message.trim();

      const finalSubject = `Help Request from ${firstName.trim() || email.trim()}`;

      await api('/tickets/public', 'POST', JSON.stringify({
        subject: finalSubject,
        message: fullMessage,
        email: email.trim(),
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
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
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
              />
            </div>

            <div className="form-group">
              <label>Contact Number</label>
              <input
                type="tel"
                required
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Message</label>
              <textarea
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
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
