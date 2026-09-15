import { useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { getPostBySlug, blogPosts } from './blogPosts.jsx';

export default function BlogPost() {
  const { slug } = useParams();
  const post = getPostBySlug(slug);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : `https://iraglobaltech.com/blog/${post.slug}`;
  const shareText = encodeURIComponent(post.title);
  const Content = post.content;

  return (
    <PublicLayout>
      <style>{`
        .pgradient-text { background: linear-gradient(135deg,var(--brand) 0%,var(--brand-2) 50%,var(--green) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .particle-wrap { max-width: 800px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
        .particle-header { text-align: center; margin-bottom: 2.5rem; animation: pfadeDown .7s ease; }
        @keyframes pfadeDown { from{opacity:0;transform:translateY(-16px);} to{opacity:1;transform:translateY(0);} }
        .particle-header .ptag { display: inline-flex; font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--brand); background: var(--brand-light); padding: .28rem .85rem; border-radius: 999px; margin-bottom: 1rem; }
        .particle-header h1 { font-size: clamp(1.7rem,4.5vw,2.6rem); font-weight: 900; line-height: 1.15; margin-bottom: 1rem; }
        .particle-meta { font-size: .85rem; color: var(--text-muted); display: flex; align-items: center; justify-content: center; gap: .6rem; }
        .particle-meta::before { content:''; width: 5px; height: 5px; border-radius: 50%; background: var(--brand); }

        .particle-card { position: relative; background: rgba(255,255,255,.88); border-radius: var(--radius-xl); padding: 2.25rem; box-shadow: 0 22px 70px rgba(74,85,162,.12); isolation: isolate; animation: pfadeUp .8s ease .15s both; backdrop-filter: blur(12px); }
        .particle-card::before { content:''; position: absolute; inset: 0; border-radius: var(--radius-xl); padding: 1.5px; background: linear-gradient(135deg,rgba(106,166,240,.55),rgba(42,157,143,.5),rgba(138,149,225,.6),rgba(106,166,240,.55)); background-size: 300% 300%; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: pborderMove 5s linear infinite; pointer-events: none; }
        @keyframes pborderMove { 0%{background-position:0% 50%;} 50%{background-position:100% 50%;} 100%{background-position:0% 50%;} }
        @keyframes pfadeUp { from{opacity:0;transform:translateY(30px);} to{opacity:1;transform:translateY(0);} }
        .particle-card h2 { font-size: 1.35rem; font-weight: 800; margin: 2rem 0 .75rem; color: var(--text); }
        .particle-card h2:first-child { margin-top: 0; }
        .particle-card p { font-size: .97rem; color: var(--text-dim); line-height: 1.8; margin-bottom: 1.1rem; }
        .particle-card ul { margin: 0 0 1.1rem 1.5rem; color: var(--text-dim); line-height: 1.8; }
        .particle-card li { margin-bottom: .45rem; }
        .particle-card code { font-family: var(--font-mono); font-size: .85em; background: var(--surface-1); padding: .15rem .4rem; border-radius: 4px; color: var(--brand); }
        .particle-card pre { background: #121326; color: #e8eaf6; border-radius: var(--radius-lg); padding: 1rem; overflow-x: auto; font-family: var(--font-mono); font-size: .85rem; line-height: 1.55; margin: 1rem 0 1.5rem; border: 1px solid rgba(255,255,255,.08); }
        .particle-card pre code { background: transparent; color: inherit; padding: 0; font-size: .85rem; }
        .particle-card .ptip { background: linear-gradient(135deg,var(--brand-light),rgba(42,157,143,.1)); border-left: 3px solid var(--brand); padding: 1rem 1.25rem; border-radius: 0 var(--radius) var(--radius) 0; margin: 1.25rem 0; font-size: .9rem; }
        .particle-card .ptip strong { display: block; margin-bottom: .25rem; }
        .particle-card a { color: var(--brand); font-weight: 600; text-decoration: none; }
        .particle-card a:hover { text-decoration: underline; }

        .particle-footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); position: relative; z-index: 1; }
        .pauthor { display: flex; align-items: center; gap: .75rem; }
        .pauthor-avatar { width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg,var(--brand),var(--green)); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; }
        .pauthor-name { font-weight: 700; font-size: .9rem; }
        .pauthor-role { font-size: .75rem; color: var(--text-muted); }
        .pshare { display: flex; align-items: center; gap: .5rem; }
        .pshare a { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: .85rem; color: var(--text-dim); transition: .15s; text-decoration: none; }
        .pshare a:hover { border-color: var(--brand); color: var(--brand); text-decoration: none; }
        .pback-link { display: inline-flex; align-items: center; gap: .4rem; margin-bottom: 1.25rem; font-size: .85rem; color: var(--text-dim); font-weight: 600; text-decoration: none; }
        .pback-link:hover { color: var(--brand); text-decoration: none; }

        .prelated { max-width: 800px; margin: 3rem auto 0; padding: 0 1.5rem; }
        .prelated h3 { font-size: 1.1rem; font-weight: 800; margin-bottom: 1rem; }
        .prelated-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
        .prelated-item { background: rgba(255,255,255,.85); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1rem; transition: transform .25s; backdrop-filter: blur(8px); }
        .prelated-item:hover { transform: translateY(-3px); }
        .prelated-item a { color: var(--text); font-weight: 700; font-size: .9rem; text-decoration: none; }
        .prelated-item a:hover { color: var(--brand); text-decoration: none; }
        .prelated-item small { display: block; margin-top: .3rem; color: var(--text-muted); font-size: .75rem; }

        @media (max-width:480px) { .particle-card { padding: 1.35rem; } .particle-header h1 { font-size: 1.5rem; } }
      `}</style>

      <main className="particle-wrap">
        <Link to="/blog" className="pback-link">← Back to Blog</Link>
        <header className="particle-header">
          <span className="ptag">{post.tag}</span>
          <h1>{post.title}</h1>
          <div className="particle-meta">{post.meta}</div>
        </header>

        <article className="particle-card">
          <Content />

          <div className="particle-footer">
            <div className="pauthor">
              <div className="pauthor-avatar">IR</div>
              <div>
                <div className="pauthor-name">IRAGT Team</div>
                <div className="pauthor-role">Product & Engineering</div>
              </div>
            </div>
            <div className="pshare">
              <a href={`https://twitter.com/intent/tweet?text=${shareText}`} target="_blank" rel="noopener" title="Share on X">X</a>
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`} target="_blank" rel="noopener" title="Share on LinkedIn">in</a>
              <a href={`mailto:?subject=${shareText}&body=${encodeURIComponent(currentUrl)}`} title="Share by email">✉</a>
            </div>
          </div>
        </article>

        <div className="prelated">
          <h3>More from the blog</h3>
          <div className="prelated-list">
            {blogPosts
              .filter((p) => p.slug !== post.slug)
              .slice(0, 3)
              .map((p) => (
                <div key={p.slug} className="prelated-item">
                  <Link to={`/blog/${p.slug}`}>{p.emoji} {p.title}</Link>
                  <small>{p.meta}</small>
                </div>
              ))}
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}
