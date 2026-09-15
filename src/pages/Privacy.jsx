import { useEffect } from 'react';
import PublicLayout from '../components/PublicLayout';

const toc = [
  { label: 'What We Collect', href: '#collect' },
  { label: 'How We Use It', href: '#use' },
  { label: 'Sharing & Disclosure', href: '#share' },
  { label: 'Security', href: '#security' },
  { label: 'Retention', href: '#retention' },
  { label: 'Your Rights', href: '#rights' },
  { label: 'Changes to This Policy', href: '#changes' },
  { label: 'Contact Us', href: '#contact' },
];

export default function Privacy() {
  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.replace('#', '');
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  return (
    <PublicLayout>
      <style>{`
        .pgradient-text { background: linear-gradient(135deg,var(--brand) 0%,var(--brand-2) 50%,var(--green) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .ppage-hero { padding: 4rem 1.5rem 2rem; max-width: 1100px; margin: 0 auto; text-align: center; }
        .ppage-hero h1 { font-size: clamp(2rem,5vw,3.2rem); font-weight: 900; margin-bottom: .75rem; }
        .ppage-hero p { font-size: 1.05rem; color: var(--text-dim); max-width: 620px; margin: 0 auto; }
        .plegal-layout { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem 4rem; display: grid; grid-template-columns: 240px 1fr; gap: 2rem; align-items: start; }
        .plegal-card { background: rgba(255,255,255,.85); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 2rem 2.25rem; box-shadow: 0 22px 70px rgba(74,85,162,.12); backdrop-filter: blur(12px); }
        .plegal-toc-card { background: rgba(255,255,255,.85); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.25rem; box-shadow: 0 12px 40px rgba(74,85,162,.08); backdrop-filter: blur(10px); }
        .plegal-card h2 { font-size: 1.3rem; font-weight: 800; margin: 1.75rem 0 .75rem; color: var(--text); }
        .plegal-card h2:first-child { margin-top: 0; }
        .plegal-card p { font-size: .95rem; color: var(--text-dim); line-height: 1.7; margin-bottom: 1rem; }
        .plegal-card ul { margin: 0 0 1rem 1.25rem; color: var(--text-dim); line-height: 1.7; }
        .plegal-card li { margin-bottom: .4rem; }
        .ptoc { position: sticky; top: 90px; }
        .ptoc h3 { font-size: .8rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; margin-bottom: .75rem; }
        .ptoc a { display: block; font-size: .85rem; color: var(--text-dim); margin-bottom: .5rem; text-decoration: none; }
        .ptoc a:hover { color: var(--brand); text-decoration: none; }

        @media (max-width:900px) { .plegal-layout { grid-template-columns: 1fr; } .ptoc { position: static; } }
        @media (max-width:480px) { .ppage-hero h1 { font-size: 1.6rem; } .plegal-card { padding: 1.25rem; } }
      `}</style>

      <section className="ppage-hero">
        <h1>Privacy <span className="pgradient-text">Policy</span></h1>
        <p>Last updated: June 12, 2024. This policy describes how IRAGT collects, uses, and protects your information.</p>
      </section>

      <div className="plegal-layout">
        <aside className="ptoc plegal-toc-card">
          <h3>On this page</h3>
          {toc.map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </aside>

        <article className="plegal-card" id="privacy">
          <h2 id="collect">1. What We Collect</h2>
          <p>IRAGT provides SSH-based tunneling infrastructure. When you create an account or use our service, we collect the following categories of information:</p>
          <ul>
            <li><strong>Account information:</strong> name, email address, and authentication credentials.</li>
            <li><strong>Billing information:</strong> payment details, billing address, and transaction history handled by our payment processor.</li>
            <li><strong>Usage data:</strong> tunnel metadata (subdomains, ports, connected duration, bytes transferred) and API request logs.</li>
            <li><strong>Device/technical data:</strong> IP address, browser type, and timestamps for security and troubleshooting.</li>
          </ul>

          <h2 id="use">2. How We Use Your Information</h2>
          <p>We use the information we collect to operate, maintain, and improve the IRAGT service. Specifically, this includes:</p>
          <ul>
            <li>Providing tunnel endpoints, custom domains, and dashboard access.</li>
            <li>Processing payments and managing subscriptions.</li>
            <li>Preventing abuse, fraud, and unauthorized access.</li>
            <li>Responding to support requests and sending important service notices.</li>
            <li>Analyzing aggregated usage patterns to improve performance and reliability.</li>
          </ul>

          <h2 id="share">3. Sharing and Disclosure</h2>
          <p>We do not sell your personal information. We only share data with trusted third parties when necessary to operate the service, such as:</p>
          <ul>
            <li>Payment processors for billing.</li>
            <li>Cloud hosting providers that run our infrastructure.</li>
            <li>Analytics providers, in anonymized/aggregated form only.</li>
            <li>Law enforcement or regulators when required by applicable law.</li>
          </ul>

          <h2 id="security">4. Security</h2>
          <p>We use industry-standard security practices including HTTPS/TLS encryption, hashed passwords, rate limiting, and role-based access controls. Tunnel traffic is not intercepted or stored unless you explicitly enable the Web Debugger for debugging your own requests.</p>

          <h2 id="retention">5. Data Retention</h2>
          <p>We retain account data for as long as your account is active. Tunnel logs and audit entries are retained for up to 90 days, after which they are automatically purged. You may request deletion of your account and associated data at any time.</p>

          <h2 id="rights">6. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal data. To exercise these rights, contact us through the Help Center.</p>

          <h2 id="changes">7. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email or a notice in the dashboard. The “Last updated” date at the top of this page reflects the most recent revision.</p>

          <h2 id="contact">8. Contact Us</h2>
          <p>If you have questions about this Privacy Policy, please reach out through our <a href="/help-center">Help Center</a>.</p>
        </article>
      </div>
    </PublicLayout>
  );
}
