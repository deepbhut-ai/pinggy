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
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>CallingAgents</span>
          </Link>
        </div>

        <ul className="public-nav-links">
          <li><a href="https://callingagents.in/#features">Features</a></li>
          <li><a href="https://callingagents.in/#solutions">Solutions</a></li>
          <li><a href="https://callingagents.in/#how-it-works">How It Works</a></li>
          <li><a href="https://callingagents.in/show-pricing">Pricing</a></li>
          <li><a href="https://callingagents.in/blogs">Blogs</a></li>
        </ul>

        <div className="public-nav-actions">
          <a href="https://callingagents.in/login" className="btn-public-login">Log in</a>
          <a href="https://callingagents.in/register" className="btn-public-try">Try Free Today</a>
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
            <li><a href="https://callingagents.in/#features" onClick={() => setMobileMenuOpen(false)}>Features</a></li>
            <li><a href="https://callingagents.in/#solutions" onClick={() => setMobileMenuOpen(false)}>Solutions</a></li>
            <li><a href="https://callingagents.in/#how-it-works" onClick={() => setMobileMenuOpen(false)}>How It Works</a></li>
            <li><a href="https://callingagents.in/show-pricing" onClick={() => setMobileMenuOpen(false)}>Pricing</a></li>
            <li><a href="https://callingagents.in/blogs" onClick={() => setMobileMenuOpen(false)}>Blogs</a></li>
          </ul>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginTop: '1.5rem' }}>
            <a href="https://callingagents.in/login" className="btn-public-login" style={{ textAlign: 'center' }}>Log in</a>
            <a href="https://callingagents.in/register" className="btn-public-try" style={{ textAlign: 'center' }}>Try Free Today →</a>
          </div>
        </div>
      )}

      {/* ─── HERO SECTION ─── */}
      <section className="help-hero">
        <h1>
          HELP<span className="outline">CENTER</span> <span className="green">SUPPORT</span>
        </h1>
        <p>
          Need help? Fill out the form and our support team will contact you shortly.
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

      {/* ─── EXACT CALLINGAGENTS FOOTER ─── */}
      <footer className="exact-site-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <a href="https://callingagents.in" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: '#fff' }}>
                  <span style={{ fontSize: '1.6rem' }}>⚡</span>
                  <span style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.02em' }}>CallingAgents</span>
                </a>
                <div className="socialsec">
                  <ul>
                    <li>
                      <a href="https://www.linkedin.com/company/callingagents" target="_blank" rel="noreferrer">
                        <span style={{ fontSize: '1.1rem', color: '#aaff00' }}>🔗</span>
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <p className="footer-desc">
              The most affordable AI voice agent with in-house data privacy, 24/7 support, and industry-specific customisation.
            </p>
            <div className="footer-status">
              <span className="status-dot"></span> All Systems Operational
            </div>
          </div>

          <div className="footer-col">
            <h4>Product</h4>
            <ul>
              <li><a href="https://callingagents.in/#features">Features</a></li>
              <li><a href="mailto:support@callingagents.in">White Label</a></li>
              <li><a href="https://callingagents.in/#how-it-works">API Access</a></li>
              <li><a href="https://callingagents.in/#how-it-works">Integrations</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Solutions</h4>
            <ul>
              <li><a href="https://callingagents.in/#solutions">Marketing Calls</a></li>
              <li><a href="https://callingagents.in/#solutions">Appointment Booking</a></li>
              <li><a href="https://callingagents.in/#solutions">Lead Generation</a></li>
              <li><a href="https://callingagents.in/#solutions">HR Recruiting</a></li>
              <li><a href="https://callingagents.in/#solutions">Call Centre</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a target="_blank" rel="noreferrer" href="https://callingagents.in/about-us">About Us</a></li>
              <li><a target="_blank" rel="noreferrer" href="https://callingagents.in/blogs">Blogs</a></li>
              <li><a target="_blank" rel="noreferrer" href="https://callingagents.in/carrers">Careers</a></li>
              <li><a target="_blank" rel="noreferrer" href="https://callingagents.in/privacy">Privacy Policy</a></li>
              <li><a target="_blank" rel="noreferrer" href="https://callingagents.in/terms-condition">Terms of Service</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Support</h4>
            <ul>
              <li><a target="_blank" rel="noreferrer" href="https://zettalgor.com/zai_calling_agents_docs">Documentation</a></li>
              <li><a target="_blank" rel="noreferrer" href="https://callingagents.in/help-center">Help Centre</a></li>
              <li><a target="_blank" rel="noreferrer" href="https://callingagents.in/contact-us">Contact Us</a></li>
              <li><a target="_blank" rel="noreferrer" href="https://callingagents.in/status-page">Status Page</a></li>
              <li><a target="_blank" rel="noreferrer" href="https://callingagents.in/report-bug">Report Bug</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copy">© 2026 Callingagents. All rights reserved.</p>
          <div className="footer-legal">
            <a target="_blank" rel="noreferrer" href="https://callingagents.in/privacy">Privacy Policy</a>
            <a target="_blank" rel="noreferrer" href="https://callingagents.in/terms-condition">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
