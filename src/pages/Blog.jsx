import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { blogPosts as fallbackPosts } from './blogPosts.jsx';

const categoryEmojiMap = {
  Tutorial: '🚀',
  Security: '🔒',
  Domains: '🌐',
  Product: '⚡',
  Teams: '🧑‍💻',
  Tips: '💡',
  Integration: '🛠️',
  Usage: '📊',
  Engineering: '💻',
};

export default function Blog() {
  const featuredRef = useRef(null);
  const gridRef = useRef(null);
  const [blogs, setBlogs] = useState(fallbackPosts);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    fetch('/api/v1/blogs')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.length > 0) {
          // Normalize API data to match component expectations
          const formatted = data.map((b) => {
            const fb = fallbackPosts.find((f) => f.slug === b.slug);
            const dateStr = b.published_at || b.created_at || '';
            let metaStr = b.read_time || '5 min read';
            if (dateStr) {
              const d = new Date(dateStr);
              if (!isNaN(d.getTime())) {
                metaStr = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${b.read_time || '5 min read'}`;
              }
            }
            return {
              slug: b.slug,
              tag: b.category || 'Article',
              emoji: fb?.emoji || categoryEmojiMap[b.category] || '⚡',
              featured: Boolean(b.featured),
              title: b.title,
              meta: metaStr,
              desc: b.summary || fb?.desc || 'Read the full guide and technical walkthrough.',
            };
          });
          setBlogs(formatted);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const selector = (ref) => (ref.current ? ref.current.querySelectorAll('[data-animate]') : []);
    const animate = (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('prevealed');
          obs.unobserve(entry.target);
        }
      });
    };
    const obs = new IntersectionObserver(animate, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    [...selector(featuredRef), ...selector(gridRef)].forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [blogs]);

  const submitNewsletter = (e) => {
    e.preventDefault();
    setSubscribed(true);
    setEmail('');
  };

  const featured = blogs.filter((p) => p.featured);
  const regular = blogs.filter((p) => !p.featured);
  const displayFeatured = featured.length > 0 ? featured : blogs.slice(0, 2);
  const displayRegular = featured.length > 0 ? regular : blogs.slice(2);

  return (
    <PublicLayout>
      <style>{`
        .pgradient-text { background: linear-gradient(135deg,var(--brand) 0%,var(--brand-2) 50%,var(--green) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .ppage-hero { padding: 4rem 1.5rem 3rem; max-width: 1100px; margin: 0 auto; text-align: center; }
        .ppage-hero h1 { font-size: clamp(2rem,5vw,3.2rem); font-weight: 900; margin-bottom: .75rem; }
        .ppage-hero p { font-size: 1.1rem; color: var(--text-dim); max-width: 620px; margin: 0 auto; }

        .pfeatured-grid { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem 2.5rem; display: grid; grid-template-columns: repeat(2,1fr); gap: 1.5rem; }
        .pfeatured-card { position: relative; background: rgba(255,255,255,.85); border-radius: var(--radius-xl); overflow: hidden; display: flex; flex-direction: column; min-height: 260px; isolation: isolate; transition: transform .35s; opacity: 0; transform: translateY(30px); backdrop-filter: blur(10px); }
        .pfeatured-card.prevealed { opacity: 1; transform: translateY(0); transition: opacity .7s ease, transform .7s ease; }
        .pfeatured-card::before { content:''; position: absolute; inset: 0; border-radius: var(--radius-xl); padding: 1.5px; background: linear-gradient(135deg,rgba(106,166,240,.6),rgba(42,157,143,.55),rgba(138,149,225,.65),rgba(106,166,240,.6)); background-size: 300% 300%; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: pborderMove 4s linear infinite; pointer-events: none; }
        .pfeatured-card:hover { transform: translateY(-5px) scale(1.01); }
        .pfeatured-card-bg { position: absolute; inset: 0; background: linear-gradient(135deg,var(--brand-light),rgba(42,157,143,.12)); opacity: .6; z-index: -2; }
        .pfeatured-card .emoji { position: absolute; right: 1.5rem; top: 1.5rem; font-size: 4rem; opacity: .22; z-index: -1; }
        .pfeatured-card-content { padding: 1.75rem; flex: 1; display: flex; flex-direction: column; position: relative; z-index: 1; }
        .pfeatured-card .ptag { align-self: flex-start; font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--brand); background: var(--brand-light); padding: .28rem .85rem; border-radius: 999px; margin-bottom: .9rem; }
        .pfeatured-card h2 { font-size: 1.3rem; font-weight: 800; margin-bottom: .6rem; line-height: 1.35; max-width: 85%; }
        .pfeatured-card h2 a { color: var(--text); text-decoration: none; }
        .pfeatured-card h2 a:hover { color: var(--brand); }
        .pfeatured-card p { font-size: .92rem; color: var(--text-dim); line-height: 1.6; flex: 1; max-width: 90%; }
        .pfeatured-card .pmeta { font-size: .78rem; color: var(--text-muted); margin-top: 1.25rem; display: flex; align-items: center; gap: .5rem; }
        .pfeatured-card .pread-link { margin-top: auto; padding-top: 1rem; font-weight: 700; font-size: .9rem; text-decoration: none; }

        .pblog-grid { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem 4rem; display: grid; grid-template-columns: repeat(3,1fr); gap: 1.5rem; }
        .pblog-card { position: relative; background: rgba(255,255,255,.85); border-radius: var(--radius-xl); overflow: hidden; transition: transform .35s, box-shadow .35s; display: flex; flex-direction: column; isolation: isolate; opacity: 0; transform: translateY(30px); backdrop-filter: blur(10px); }
        .pblog-card.prevealed { opacity: 1; transform: translateY(0); transition: opacity .7s ease, transform .7s ease; }
        .pblog-card::before { content:''; position: absolute; inset: 0; border-radius: var(--radius-xl); padding: 1.5px; background: linear-gradient(135deg,rgba(74,85,162,.25),rgba(42,157,143,.25),rgba(106,166,240,.3),rgba(74,85,162,.25)); background-size: 300% 300%; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: pborderMove 5s linear infinite; pointer-events: none; opacity: 0; transition: opacity .35s; }
        .pblog-card:hover::before { opacity: 1; }
        .pblog-card:hover { transform: translateY(-8px) scale(1.01); box-shadow: 0 24px 60px rgba(74,85,162,.14); }
        @keyframes pborderMove { 0%{background-position:0% 50%;} 50%{background-position:100% 50%;} 100%{background-position:0% 50%;} }
        .pblog-card-thumb { height: 170px; background: linear-gradient(135deg,var(--brand-light),rgba(42,157,143,.12)); display: flex; align-items: center; justify-content: center; font-size: 3.2rem; position: relative; overflow: hidden; }
        .pblog-card-thumb::after { content:''; position: absolute; inset: -50%; background: radial-gradient(circle,rgba(255,255,255,.35),transparent 40%); animation: pthumbShimmer 6s ease-in-out infinite; }
        @keyframes pthumbShimmer { 0%,100%{transform:translate(-10%,-10%) rotate(0deg);} 50%{transform:translate(10%,10%) rotate(15deg);} }
        .pblog-card-content { padding: 1.5rem; flex: 1; display: flex; flex-direction: column; }
        .pblog-card .ptag { display: inline-flex; align-self: flex-start; font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--brand); background: var(--brand-light); padding: .25rem .7rem; border-radius: 999px; margin-bottom: .75rem; }
        .pblog-card h2 { font-size: 1.12rem; font-weight: 800; margin-bottom: .5rem; line-height: 1.35; }
        .pblog-card h2 a { color: var(--text); text-decoration: none; }
        .pblog-card h2 a:hover { color: var(--brand); }
        .pblog-card p { font-size: .88rem; color: var(--text-dim); line-height: 1.6; flex: 1; }
        .pblog-card .pmeta { font-size: .75rem; color: var(--text-muted); margin-top: 1rem; display: flex; align-items: center; gap: .5rem; }
        .pblog-card .pmeta::before { content:''; display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: var(--brand); }
        .pblog-card .pread-link { margin-top: .6rem; font-weight: 700; font-size: .85rem; display: inline-flex; align-items: center; gap: .3rem; transition: gap .25s; text-decoration: none; }
        .pblog-card:hover .pread-link { gap: .6rem; }

        .pnewsletter { max-width: 700px; margin: 0 auto 4rem; padding: 2.25rem; background: rgba(255,255,255,.85); border-radius: var(--radius-xl); box-shadow: 0 22px 70px rgba(74,85,162,.12); border: 1px solid var(--border); text-align: center; position: relative; overflow: hidden; backdrop-filter: blur(12px); }
        .pnewsletter::before { content:''; position: absolute; inset: 0; border-radius: var(--radius-xl); padding: 1.5px; background: linear-gradient(135deg,rgba(106,166,240,.55),rgba(42,157,143,.5),rgba(138,149,225,.6),rgba(106,166,240,.55)); background-size: 300% 300%; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: pborderMove 4s linear infinite; pointer-events: none; }
        .pnewsletter h3 { font-size: 1.45rem; font-weight: 800; margin-bottom: .5rem; }
        .pnewsletter p { color: var(--text-dim); margin-bottom: 1.35rem; }
        .pnewsletter form { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; position: relative; z-index: 1; }
        .pnewsletter input { flex: 1; min-width: 220px; padding: .75rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); font-family: var(--font); font-size: .9rem; transition: border-color .2s, box-shadow .2s; }
        .pnewsletter input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px rgba(74,85,162,.12); }

        @media (max-width:1000px) { .pfeatured-grid { grid-template-columns: 1fr; max-width: 680px; } .pblog-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width:900px) { .pblog-grid { grid-template-columns: 1fr; max-width: 520px; } }
        @media (max-width:480px) { .ppage-hero h1 { font-size: 1.6rem; } .pnewsletter form { flex-direction: column; } .pfeatured-card h2 { font-size: 1.1rem; } }
      `}</style>

      <section className="ppage-hero">
        <h1>IRAGT <span className="pgradient-text">Blog</span></h1>
        <p>Tutorials, product updates, and tips for sharing your localhost with the world.</p>
      </section>

      <section className="pfeatured-grid" ref={featuredRef}>
        {displayFeatured.map((post) => (
          <article key={post.slug} className="pfeatured-card" data-animate>
            <div className="pfeatured-card-bg" />
            <div className="emoji">{post.emoji}</div>
            <div className="pfeatured-card-content">
              <span className="ptag">{post.tag}</span>
              <h2><Link to={`/blog/${post.slug}`}>{post.title}</Link></h2>
              <p>{post.desc}</p>
              <div className="pmeta">{post.meta}</div>
              <Link to={`/blog/${post.slug}`} className="pread-link">Read more →</Link>
            </div>
          </article>
        ))}
      </section>

      <section className="pblog-grid" id="blog" ref={gridRef}>
        {displayRegular.map((post) => (
          <article key={post.slug} className="pblog-card" data-animate>
            <div className="pblog-card-thumb">{post.emoji}</div>
            <div className="pblog-card-content">
              <span className="ptag">{post.tag}</span>
              <h2><Link to={`/blog/${post.slug}`}>{post.title}</Link></h2>
              <p>{post.desc}</p>
              <div className="pmeta">{post.meta}</div>
              <Link to={`/blog/${post.slug}`} className="pread-link">Read more →</Link>
            </div>
          </article>
        ))}
      </section>

      <section className="pnewsletter">
        <h3>Stay in the loop</h3>
        <p>Get the latest tutorials and product updates delivered to your inbox.</p>
        <form onSubmit={submitNewsletter} noValidate>
          <input type="email" placeholder="you@example.com" required aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="pbtn pbtn-animated">{subscribed ? 'Subscribed!' : 'Subscribe'}</button>
        </form>
      </section>
    </PublicLayout>
  );
}
