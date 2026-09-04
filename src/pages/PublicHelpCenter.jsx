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
  const [subject, setSubject] = useState('');
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
      if (contactNumber.trim()) details.push(`Contact / Subdomain: ${contactNumber.trim()}`);

      const fullMessage = details.length > 0
        ? `${details.join(' | ')}\n\n${message.trim()}`
        : message.trim();

      const finalSubject = subject.trim() || `Help Request from ${firstName.trim() || email.trim()}`;

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
      setSubject('');
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
      <section className="help-hero-banner" style={{ paddingTop: '7rem' }}>
        <h1 className="help-hero-title">
          HELP <span className="help-hero-outline">CENTER</span> <span className="help-hero-accent">SUPPORT</span>
        </h1>
        <p className="help-hero-sub">
          Need help? Fill out the form below and our support team will contact you shortly.
        </p>
      </section>

      {/* ─── QUICK CARDS ─── */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '0 1.5rem 2rem' }}>
        <div className="help-resource-grid">
          <Link to="/dashboard/quickstart" className="help-resource-card">
            <div className="help-resource-icon">⚡</div>
            <div className="help-resource-title">Quickstart Setup</div>
            <div className="help-resource-desc">Instant zero-install SSH command guide for local tunnels.</div>
          </Link>
          <Link to="/dashboard/apidocs" className="help-resource-card">
            <div className="help-resource-icon">📖</div>
            <div className="help-resource-title">API Documentation</div>
            <div className="help-resource-desc">REST API schemas, authentication tokens, and webhooks.</div>
          </Link>
          <Link to="/dashboard/domains" className="help-resource-card">
            <div className="help-resource-icon">🌐</div>
            <div className="help-resource-title">Custom Domains</div>
            <div className="help-resource-desc">Connect and secure your own domains with SSL.</div>
          </Link>
          <div className="help-resource-card" style={{ cursor: 'default' }}>
            <div className="help-resource-icon">🟢</div>
            <div className="help-resource-title">System Status</div>
            <div className="help-resource-desc">All SSH edge servers and proxy listeners are operational.</div>
          </div>
        </div>

        {/* ─── SUBMIT REQUEST CARD ─── */}
        <div className="help-form-card">
          <div className="help-card-header">
            <h2>Submit Your Request</h2>
            <p className="dim">Please provide your details below.</p>
          </div>

          <form onSubmit={handleSubmit}>
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

        {/* ─── FAQ ACCORDION ─── */}
        <div className="card" style={{ marginTop: '2.5rem' }}>
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
      </section>

      {/* ─── PUBLIC FOOTER ─── */}
      <footer className="public-footer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', maxWidth: 1000, margin: '0 auto' }}>
          <div>
            <strong style={{ fontSize: '1.1rem' }}>⚡ IRAGT Tunnels</strong>
            <p className="dim" style={{ fontSize: '.8rem', marginTop: '.25rem' }}>Fast, secure reverse proxy and SSH tunneling platform.</p>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '.85rem' }}>
            <Link to="/dashboard/quickstart" className="dim">Quickstart</Link>
            <Link to="/dashboard/apidocs" className="dim">API Docs</Link>
            <Link to="/help-center" className="dim" style={{ color: '#aaff00' }}>Help Center</Link>
            <Link to="/login" className="dim">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
