import { useEffect } from 'react';
import PublicLayout from '../components/PublicLayout';

const toc = [
  { label: 'Agreement to Terms', href: '#agreement' },
  { label: 'Accounts', href: '#accounts' },
  { label: 'Acceptable Use', href: '#acceptable' },
  { label: 'Payments \u0026 Subscriptions', href: '#payments' },
  { label: 'Intellectual Property', href: '#ip' },
  { label: 'Disclaimers', href: '#disclaimers' },
  { label: 'Limitation of Liability', href: '#limitation' },
  { label: 'Termination', href: '#termination' },
  { label: 'Governing Law', href: '#governing' },
  { label: 'Changes to These Terms', href: '#changes' },
  { label: 'Contact Us', href: '#contact' },
];

export default function Terms() {
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
        .plegal-card a { color: var(--brand); font-weight: 600; text-decoration: none; }
        .plegal-card a:hover { text-decoration: underline; }
        .ptoc { position: sticky; top: 90px; }
        .ptoc h3 { font-size: .8rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; margin-bottom: .75rem; }
        .ptoc a { display: block; font-size: .85rem; color: var(--text-dim); margin-bottom: .5rem; text-decoration: none; }
        .ptoc a:hover { color: var(--brand); text-decoration: none; }

        @media (max-width:900px) { .plegal-layout { grid-template-columns: 1fr; } .ptoc { position: static; } }
        @media (max-width:480px) { .ppage-hero h1 { font-size: 1.6rem; } .plegal-card { padding: 1.25rem; } }
      `}</style>

      <section className="ppage-hero">
        <h1>Terms & <span className="pgradient-text">Conditions</span></h1>
        <p>Last updated: June 12, 2024. By using IRAGT, you agree to these terms. Please read them carefully.</p>
      </section>

      <div className="plegal-layout">
        <aside className="ptoc plegal-toc-card">
          <h3>On this page</h3>
          {toc.map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </aside>

        <article className="plegal-card" id="terms">
          <h2 id="agreement">1. Agreement to Terms</h2>
          <p>These Terms of Service (“Terms”) govern your access to and use of the IRAGT website, APIs, and tunneling services (collectively, the “Service”). By creating an account, accessing the dashboard, or using an IRAGT tunnel, you agree to be bound by these Terms and our <a href="/privacy">Privacy Policy</a>. If you do not agree, you may not use the Service.</p>

          <h2 id="accounts">2. Accounts</h2>
          <p>You must provide accurate and complete information when registering. You are responsible for safeguarding your account credentials and for all activity that occurs under your account. Notify us immediately if you suspect unauthorized use.</p>

          <h2 id="acceptable">3. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Transmit malware, phishing content, or unsolicited bulk messages.</li>
            <li>Host, promote, or facilitate illegal activity or content that violates third-party rights.</li>
            <li>Attack, scan, or harass other networks or systems.</li>
            <li>Resell, reverse-engineer, or abuse the Service in ways that degrade performance for others.</li>
            <li>Circumvent rate limits, authentication, or fair-use restrictions.</li>
          </ul>
          <p>We reserve the right to suspend or terminate accounts that violate these rules.</p>

          <h2 id="payments">4. Payments and Subscriptions</h2>
          <p>Some features require a paid subscription. You authorize us to charge your selected payment method on the billing cycle you choose. Subscriptions automatically renew unless canceled before the renewal date. Refunds are handled in accordance with applicable law and our refund policy as posted at checkout.</p>

          <h2 id="ip">5. Intellectual Property</h2>
          <p>IRAGT retains all rights to the Service, including logos, software, documentation, and underlying infrastructure. You retain ownership of your own content and data that passes through your tunnels. You grant us a limited license to process such data solely to operate the Service.</p>

          <h2 id="disclaimers">6. Disclaimers</h2>
          <p>The Service is provided “as is” and “as available” without warranties of any kind, either express or implied. We do not guarantee uninterrupted or error-free operation. You are responsible for the security and lawfulness of the services you expose through tunnels.</p>

          <h2 id="limitation">7. Limitation of Liability</h2>
          <p>To the extent permitted by law, IRAGT shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising out of or relating to your use of the Service.</p>

          <h2 id="termination">8. Termination</h2>
          <p>You may stop using the Service at any time. We may suspend or terminate your access if you violate these Terms, fail to pay when due, or if required by law. Upon termination, your tunnels will stop and your account data will be handled as described in the Privacy Policy.</p>

          <h2 id="governing">9. Governing Law</h2>
          <p>These Terms are governed by the laws of the jurisdiction in which IRAGT is registered, without regard to conflict of law principles. Any disputes shall be resolved in the competent courts of that jurisdiction.</p>

          <h2 id="changes">10. Changes to These Terms</h2>
          <p>We may update these Terms from time to time. We will notify you of material changes via email or a dashboard notice. Your continued use of the Service after changes take effect constitutes acceptance of the revised Terms.</p>

          <h2 id="contact">11. Contact Us</h2>
          <p>Questions about these Terms should be directed through our <a href="/help-center">Help Center</a>.</p>
        </article>
      </div>
    </PublicLayout>
  );
}
