import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const publicLinks = [
  { label: 'Home', to: '/' },
  { label: 'How It Works', to: '/#how-it-works', hash: '#how-it-works' },
  { label: 'Pricing', to: '/#pricing', hash: '#pricing' },
  { label: 'Guide', to: '/guide' },
  { label: 'FAQ', to: '/#faq', hash: '#faq' },
  { label: 'Help Center', to: '/help-center' },
  { label: 'Blog', to: '/blog' },
];

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
  }
}

function NavLink({ l }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (l.hash) {
    return (
      <a
        href={l.to}
        onClick={(e) => {
          e.preventDefault();
          const id = l.hash.replace('#', '');
          if (location.pathname === '/' && document.getElementById(id)) {
            scrollToId(id);
            window.history.replaceState(null, '', l.hash);
          } else {
            navigate(`/#${id}`);
          }
        }}
      >
        {l.label}
      </a>
    );
  }
  return <Link to={l.to}>{l.label}</Link>;
}

function useIsLoggedIn() {
  const [email, setEmail] = useState('');
  useEffect(() => {
    const token = localStorage.getItem('iragt_token');
    if (!token) return;
    fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => u && setEmail(u.email))
      .catch(() => {});
  }, []);
  return email;
}

export default function PublicLayout({ children, topAlert = null }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const bgRef = useRef(null);
  const rippleLayerRef = useRef(null);
  const email = useIsLoggedIn();

  useEffect(() => {
    setMobileOpen(false);
    document.body.style.overflow = '';
  }, [location]);

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (!hash) return;
    const scroll = () => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        return true;
      }
      return false;
    };
    if (scroll()) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (scroll() || attempts > 40) {
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const bg = bgRef.current;
    const rippleLayer = rippleLayerRef.current;
    if (!bg || !rippleLayer) return;
    const setHeight = () => {
      bg.style.minHeight = `${Math.max(window.innerHeight, document.documentElement.scrollHeight)}px`;
    };
    setHeight();
    window.addEventListener('resize', setHeight);
    const onLoad = () => setHeight();
    window.addEventListener('load', onLoad);

    for (let i = 0; i < 22; i++) {
      const p = document.createElement('div');
      p.className = 'pparticle';
      const s = Math.random() * 8 + 4;
      p.style.width = `${s}px`;
      p.style.height = `${s}px`;
      p.style.left = `${Math.random() * 100}vw`;
      p.style.animationDuration = `${Math.random() * 10 + 12}s`;
      p.style.animationDelay = `${Math.random() * 15}s`;
      p.style.opacity = Math.random() * 0.4 + 0.3;
      bg.appendChild(p);
    }

    function createRipple(x, y, withRing) {
      const e = document.createElement('div');
      e.className = 'pripple';
      const sz = Math.max(window.innerWidth, window.innerHeight) * 0.18;
      e.style.width = `${sz}px`;
      e.style.height = `${sz}px`;
      e.style.left = `${x - sz / 2}px`;
      e.style.top = `${y - sz / 2}px`;
      rippleLayer.appendChild(e);
      if (withRing) {
        const r2 = document.createElement('div');
        r2.className = 'pripple-ring';
        r2.style.width = `${sz}px`;
        r2.style.height = `${sz}px`;
        r2.style.left = e.style.left;
        r2.style.top = e.style.top;
        rippleLayer.appendChild(r2);
        setTimeout(() => r2.remove(), 1600);
      }
      setTimeout(() => e.remove(), 1600);
    }

    const ignore = (el) => el.closest('input,button,a,textarea,select,.pnav-toggle,summary');
    const onPointerDown = (e) => {
      if (ignore(e.target)) return;
      createRipple(e.clientX, e.clientY, true);
    };
    let last = 0;
    const onPointerMove = (e) => {
      const now = Date.now();
      if (now - last < 120 || ignore(e.target)) return;
      last = now;
      createRipple(e.clientX, e.clientY, false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    const interval = setInterval(() => createRipple(Math.random() * window.innerWidth, Math.random() * window.innerHeight, true), 2800);

    return () => {
      window.removeEventListener('resize', setHeight);
      window.removeEventListener('load', onLoad);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      clearInterval(interval);
    };
  }, []);

  const toggleMobile = () => {
    const next = !mobileOpen;
    setMobileOpen(next);
    document.body.style.overflow = next ? 'hidden' : '';
  };

  const closeMobile = () => {
    setMobileOpen(false);
    document.body.style.overflow = '';
  };

  return (
    <>
      <style>{`
        :root {
          --font: "Hanken Grotesk", system-ui, -apple-system, sans-serif;
          --font-mono: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
          --brand: #4a55a2; --brand-hover: #3d468a; --brand-light: rgba(74,85,162,.10); --brand-2: #6b8cff;
          --green: #2a9d8f; --bg: #ffffff; --surface: #ffffff; --surface-1: #f4f5fb; --surface-2: #e8eaf6;
          --border: rgba(74,85,162,.12); --border-hover: rgba(74,85,162,.22);
          --text: #1a1a2e; --text-dim: #5a5d7a; --text-muted: #8b8fa8;
          --radius: 8px; --radius-lg: 14px; --radius-xl: 22px;
        }
        .ppublic-page { font-family: var(--font); background: #f4f5fb; color: var(--text); line-height: 1.6; overflow-x: hidden; position: relative; min-height: 100vh; }
        .ppublic-page ::selection { background: var(--brand-light); }
        .ppublic-page ::-webkit-scrollbar { width: 10px; }
        .ppublic-page ::-webkit-scrollbar-track { background: rgba(232,238,246,.6); border-radius: 10px; }
        .ppublic-page ::-webkit-scrollbar-thumb { background: linear-gradient(180deg,var(--brand) 0%,var(--green) 100%); border-radius: 10px; border: 2px solid rgba(232,238,246,.6); }
        .ppublic-page ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg,#3d468a 0%,#238b7f 100%); }
        .ppublic-page { scrollbar-width: thin; scrollbar-color: var(--brand) rgba(232,238,246,.6); }

        /* Background sits at the very back; content wrappers are z-index:2+ so the animation never overlaps blocks */
        .pbg { position: fixed; inset: 0; z-index: -10; overflow: hidden; background: linear-gradient(135deg,#f4f5fb 0%,#e8eaf6 40%,#ffffff 100%); width: 100vw; min-height: 100vh; pointer-events: none; }
        .pblob { position: absolute; border-radius: 50%; filter: blur(110px); opacity: .25; animation: pblobMove 22s ease-in-out infinite; }
        .pblob:nth-child(1) { width: 42vw; height: 42vw; background: radial-gradient(circle,rgba(138,149,225,.42),transparent 70%); top: -8%; left: -8%; }
        .pblob:nth-child(2) { width: 38vw; height: 38vw; background: radial-gradient(circle,rgba(168,179,235,.38),transparent 70%); bottom: -8%; right: -8%; animation-delay: -7s; }
        .pblob:nth-child(3) { width: 28vw; height: 28vw; background: radial-gradient(circle,rgba(122,188,214,.36),transparent 70%); top: 45%; left: 40%; animation-delay: -14s; }
        .pblob:nth-child(4) { width: 22vw; height: 22vw; background: radial-gradient(circle,rgba(199,210,254,.4),transparent 70%); top: 18%; right: 12%; animation-delay: -4s; }
        @keyframes pblobMove { 0%,100%{transform:translate(0,0) scale(1) rotate(0deg);border-radius:60% 40% 55% 45%/55% 45% 60% 40%;} 25%{transform:translate(6%,-5%) scale(1.06) rotate(6deg);border-radius:45% 55% 40% 60%/50% 60% 40% 55%;} 50%{transform:translate(-4%,8%) scale(.97) rotate(-4deg);border-radius:55% 45% 60% 40%/45% 55% 50% 60%;} 75%{transform:translate(-6%,-3%) scale(1.03) rotate(5deg);border-radius:50% 50% 45% 55%/60% 40% 55% 45%;} }
        .pwave-overlay { position: absolute; inset: 0; background: radial-gradient(circle at 20% 30%,rgba(255,255,255,.4) 0%,transparent 45%), radial-gradient(circle at 80% 70%,rgba(255,255,255,.3) 0%,transparent 40%); animation: pshimmer 14s ease-in-out infinite; }
        @keyframes pshimmer { 0%,100%{opacity:.5;transform:scale(1);} 50%{opacity:.8;transform:scale(1.03);} }
        /* Particles stay behind content, very low opacity so they look like ambient dust */
        .pparticle { position: absolute; border-radius: 50%; background: rgba(138,149,225,.28); filter: blur(2px); animation: pfloatUp linear infinite; pointer-events: none; opacity: .25 !important; }
        @keyframes pfloatUp { 0%{transform:translateY(110vh) scale(.6);opacity:0;} 15%{opacity:.55;} 85%{opacity:.55;} 100%{transform:translateY(-10vh) scale(1.1);opacity:0;} }
        .pripple { position: absolute; border-radius: 50%; background: radial-gradient(circle,rgba(255,255,255,.85) 0%,rgba(199,210,254,.55) 35%,rgba(138,149,225,.22) 55%,transparent 72%); border: 1.5px solid rgba(138,149,225,.35); transform: scale(0); pointer-events: none; animation: prippleExpand 1.4s ease-out forwards; filter: blur(2px); }
        .pripple-ring { position: absolute; border-radius: 50%; border: 2.5px solid rgba(138,149,225,.55); transform: scale(0); pointer-events: none; animation: pringExpand 1.6s ease-out forwards; }
        /* Fixed layer that holds cursor/auto ripples between the background and the content */
        .pripple-layer { position: fixed; inset: 0; z-index: 1; overflow: hidden; pointer-events: none; }
        @keyframes prippleExpand { to{transform:scale(5);opacity:0;} }
        @keyframes pringExpand { to{transform:scale(6);opacity:0;} }

        .pbtn { display: inline-flex; align-items: center; justify-content: center; gap: .375rem; background: var(--brand); color: #fff; border: none; border-radius: var(--radius); padding: .5rem 1.25rem; font-size: .9rem; font-weight: 600; font-family: var(--font); cursor: pointer; transition: .15s; text-decoration: none; }
        .pbtn:hover { background: var(--brand-hover); text-decoration: none; }
        .pbtn-ghost { background: transparent; color: var(--brand); border: 1.5px solid var(--border); }
        .pbtn-ghost:hover { background: var(--brand-light); border-color: var(--brand-hover); text-decoration: none; }
        .pbtn-lg { padding: .85rem 1.75rem; font-size: 1rem; }
        .pbtn-animated { position: relative; overflow: hidden; transition: transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .25s, background .2s; }
        .pbtn-animated:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 10px 30px rgba(106,166,240,.42); }

        /* Glass surface: content floats above the animated background. Higher opacity so blocks read as solid surfaces. */
        .pglass { background: rgba(255,255,255,.82); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.75); border-radius: var(--radius-xl); box-shadow: 0 14px 44px rgba(74,85,162,.08), inset 0 0 0 1px rgba(255,255,255,.55); padding: 2rem; }
        .pglass-dark { background: rgba(26,26,46,.04); border: 1px solid rgba(74,85,162,.10); }

        .pnav { position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,.92); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,.7); padding: .75rem 1.5rem; display: flex; align-items: center; justify-content: space-between; }
        .plogo { font-size: 1.25rem; font-weight: 900; display: flex; align-items: center; gap: .5rem; color: var(--text); text-decoration: none; }
        .plogo:hover { text-decoration: none; }
        .plinks { display: flex; align-items: center; gap: 1.25rem; }
        .plinks a { color: var(--text-dim); font-size: .9rem; font-weight: 500; text-decoration: none; }
        .plinks a:hover { color: var(--text); text-decoration: none; }
        .plinks a.pbtn { color: #fff; }
        .pnav-toggle { display: none; flex-direction: column; justify-content: center; gap: 5px; width: 36px; height: 36px; background: transparent; border: none; cursor: pointer; z-index: 200; padding: 2px; }
        .pnav-toggle span { display: block; height: 2.5px; width: 100%; border-radius: 2px; background: var(--text); transition: all .3s ease; }
        .pnav-toggle.open span:nth-child(1) { transform: translateY(7.5px) rotate(45deg); }
        .pnav-toggle.open span:nth-child(2) { opacity: 0; }
        .pnav-toggle.open span:nth-child(3) { transform: translateY(-7.5px) rotate(-45deg); }
        .pnav-mobile-menu { display: none; position: fixed; top: 60px; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,.98); backdrop-filter: blur(18px); z-index: 150; padding: 1.5rem; flex-direction: column; gap: .25rem; overflow-y: auto; animation: pmobileMenuIn .25s ease; }
        @keyframes pmobileMenuIn { from{opacity:0;transform:translateY(-10px);} to{opacity:1;transform:translateY(0);} }
        .pnav-mobile-menu.show { display: flex; }
        .pnav-mobile-menu a { padding: .85rem .5rem; font-size: 1.05rem; font-weight: 600; color: var(--text); border-bottom: 1px solid var(--border); text-decoration: none; }
        .pnav-mobile-menu a:hover { color: var(--brand); text-decoration: none; }
        .pnav-mobile-menu .pbtn { margin-top: 1rem; border-bottom: none; text-align: center; }

        .ptop-alert { position: relative; z-index: 2; background: linear-gradient(90deg, var(--brand-light), rgba(42,157,143,.10)); border-bottom: 1px solid var(--border); padding: .55rem 1rem; text-align: center; font-size: .82rem; color: var(--text-dim); }
        .ptop-alert a { color: var(--brand); font-weight: 700; text-decoration: none; }

        /* Content wrapper sits above the fixed background */
        .pcontent { position: relative; z-index: 10; }
        .pfooter { position: relative; z-index: 10; border-top: 1px solid rgba(255,255,255,.6); background: rgba(255,255,255,.82); backdrop-filter: blur(12px); padding: 3rem 1.5rem 2rem; }
        .pfooter-grid { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1.5fr repeat(4,1fr); gap: 2rem; }
        .pfooter-brand { font-size: 1.25rem; font-weight: 900; }
        .pfooter-brand p { font-size: .85rem; color: var(--text-dim); margin-top: .5rem; line-height: 1.6; }
        .pfooter-col h4 { font-size: .75rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 1rem; }
        .pfooter-col a { display: block; font-size: .85rem; color: var(--text-dim); margin-bottom: .55rem; text-decoration: none; }
        .pfooter-col a:hover { color: var(--brand); text-decoration: none; }
        .pfooter-bottom { max-width: 1100px; margin: 2rem auto 0; padding-top: 1.5rem; border-top: 1px solid var(--border); text-align: center; font-size: .8rem; color: var(--text-muted); }

        @media (max-width: 900px) { .plinks { display: none; } .pnav-toggle { display: flex; } .pfooter-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 800px) { .pfooter-grid { grid-template-columns: 1fr; gap: 1.5rem; } }
      `}</style>
      <div className="ppublic-page">
        <div className="pbg" ref={bgRef} aria-hidden="true">
          <div className="pblob" />
          <div className="pblob" />
          <div className="pblob" />
          <div className="pblob" />
          <div className="pwave-overlay" />
        </div>
        <div className="pripple-layer" ref={rippleLayerRef} aria-hidden="true" />

        {topAlert && (
          <div className="ptop-alert">
            {topAlert.text}{' '}
            <a href={topAlert.href}>{topAlert.linkText}</a>
          </div>
        )}

        <nav className="pnav">
          <Link to="/" className="plogo">
            <span>⚡</span>IRAGT
          </Link>
          <div className="plinks">
            {publicLinks.map((l) => (
              <NavLink key={l.to} l={l} />
            ))}
            {email ? (
              <>
                <Link to="/dashboard" style={{ color: 'var(--text)' }}>{email}</Link>
                <Link to="/dashboard" className="pbtn">Dashboard →</Link>
              </>
            ) : (
              <Link to="/login" className="pbtn">Get Started</Link>
            )}
          </div>
          <button
            className={`pnav-toggle ${mobileOpen ? 'open' : ''}`}
            aria-label="Toggle menu"
            onClick={toggleMobile}
          >
            <span /><span /><span />
          </button>
        </nav>

        <div className={`pnav-mobile-menu ${mobileOpen ? 'show' : ''}`} onClick={(e) => e.target.tagName === 'A' && closeMobile()}>
          {publicLinks.map((l) => (
            <NavLink key={l.to} l={l} />
          ))}
          <Link to="/login" className="pbtn">Get Started</Link>
        </div>

        <main className="pcontent">{children}</main>

        <footer className="pfooter">
          <div className="pfooter-grid">
            <div className="pfooter-brand"><span>⚡</span> IRAGT<p>Public URLs for localhost without downloading any binary. Built with SSH & Cloudflare.</p></div>
            <div className="pfooter-col"><h4>Product</h4><Link to="/#how-it-works">How It Works</Link><Link to="/#pricing">Pricing</Link></div>
            <div className="pfooter-col"><h4>Resources</h4><Link to="/#faq">Help</Link><Link to="/help-center">Help Center</Link><Link to="/blog">Blog</Link></div>
            <div className="pfooter-col"><h4>Legal</h4><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
          </div>
          <div className="pfooter-bottom">Powered by SSH & Cloudflare · © 2024 IRAGT</div>
        </footer>
      </div>
    </>
  );
}
