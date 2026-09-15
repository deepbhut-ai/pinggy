import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';

export default function Landing() {
  const [proto, setProto] = useState('http');
  const [addr, setAddr] = useState('localhost:8080');
  const [copied, setCopied] = useState(false);
  const hiwWrapRef = useRef(null);
  const hiwTimelineRef = useRef(null);
  const progressRef = useRef(null);

  const cmd = `ssh -p 2222 -R0:${addr} your-token@ssh.iraglobaltech.com${proto === 'http' ? '' : ':' + proto.toUpperCase() + ':'}`;

  const copyCmd = () => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  useEffect(() => {
    const wrap = hiwWrapRef.current;
    const timeline = hiwTimelineRef.current;
    const progress = progressRef.current;
    if (!wrap || !timeline || !progress) return;

    const rows = wrap.querySelectorAll('.phiw-row');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('phiw-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, root: wrap, rootMargin: '0px 0px -30px 0px' }
    );
    rows.forEach((row) => observer.observe(row));

    const updateProgress = () => {
      const sh = wrap.scrollHeight - wrap.clientHeight;
      if (sh <= 0) return;
      progress.style.height = `${timeline.offsetHeight * Math.min(1, Math.max(0, wrap.scrollTop / sh))}px`;
    };
    wrap.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();

    return () => {
      observer.disconnect();
      wrap.removeEventListener('scroll', updateProgress);
    };
  }, []);

  return (
    <PublicLayout topAlert={{ text: 'The Web Debugger is now built into the Dashboard. Inspect, modify, and replay your tunnel traffic right in the browser.', href: '/#how-it-works', linkText: 'Learn more →' }}>
      <style>{`
        .pgradient-text { background: linear-gradient(135deg,var(--brand) 0%,var(--brand-2) 50%,var(--green) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .phero { position: relative; padding: 2.5rem 1.5rem 3.5rem; max-width: 1200px; margin: 0 auto; overflow: hidden; }
        .phero-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5rem; align-items: center; }
        @media (max-width:900px) { .phero-wrap { grid-template-columns: 1fr; gap: 2rem; } }
        .phero-badge { display: inline-flex; align-items: center; gap: .5rem; background: var(--brand-light); border: 1px solid rgba(74,85,162,.18); border-radius: 999px; padding: .35rem .9rem; font-size: .78rem; font-weight: 700; color: var(--brand); margin-bottom: 1.25rem; }
        .ppulse-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: ppulse 2s infinite; }
        @keyframes ppulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
        .phero-title { font-size: clamp(2.2rem,5vw,3.8rem); font-weight: 900; line-height: 1.05; letter-spacing: -.03em; margin-bottom: .75rem; }
        .phero-sub { font-size: 1.2rem; color: var(--text-dim); margin-bottom: .75rem; font-weight: 600; }
        .phero-desc { font-size: 1rem; color: var(--text-muted); margin-bottom: 1.5rem; max-width: 460px; line-height: 1.6; }
        .phero-cta-row { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .phero-stats { display: flex; gap: 2rem; margin-top: 1.5rem; flex-wrap: wrap; }
        .phero-stat .pnum { font-size: 1.6rem; font-weight: 900; color: var(--brand); }
        .phero-stat .plbl { font-size: .78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
        .phero-preview { position: relative; }
        .phero-terminal { background: #1a1a2e; border-radius: var(--radius-xl); overflow: hidden; box-shadow: 0 25px 70px rgba(26,26,46,.25); position: relative; }
        .phero-terminal::before { content:''; position: absolute; inset: -2px; border-radius: inherit; padding: 2px; background: linear-gradient(90deg,var(--brand-2),var(--green),var(--brand),var(--brand-2)); background-size: 300% 100%; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; animation: pmoveBorder 5s linear infinite; }
        @keyframes pmoveBorder { 0%{background-position:0% 50%;} 100%{background-position:300% 50%;} }
        .phero-terminal-header { display: flex; align-items: center; justify-content: space-between; padding: .75rem 1.25rem; background: rgba(255,255,255,.04); border-bottom: 1px solid rgba(255,255,255,.06); }
        .phero-terminal-dots { display: flex; gap: .4rem; }
        .phero-terminal-dots span { width: 11px; height: 11px; border-radius: 50%; }
        .phero-terminal-dots span:nth-child(1) { background: #ff5f57; }
        .phero-terminal-dots span:nth-child(2) { background: #febc2e; }
        .phero-terminal-dots span:nth-child(3) { background: #28c840; }
        .phero-terminal-title { font-size: .72rem; color: #8b8fa8; font-weight: 600; font-family: var(--font-mono); }
        .phero-terminal-body { padding: 1.5rem 1.25rem; font-family: var(--font-mono); font-size: .85rem; line-height: 1.8; color: #c8cdd9; }
        .pt-prompt { color: #6b8cff; font-weight: 700; }
        .pt-out { color: #8b8fa8; }
        .pt-url { color: #2a9d8f; font-weight: 700; }
        .pt-ok { color: #28c840; font-weight: 700; }
        .pt-cmt { color: #4a4a6a; }
        .pt-cursor { display: inline-block; width: 9px; height: 18px; background: #6b8cff; animation: pblink 1s steps(2,start) infinite; vertical-align: middle; margin-left: 2px; }
        @keyframes pblink { 0%,100%{opacity:1;} 50%{opacity:0;} }
        .phero-float-card { position: absolute; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: .75rem 1.1rem; box-shadow: 0 12px 35px rgba(74,85,162,.12); display: flex; align-items: center; gap: .65rem; font-size: .82rem; font-weight: 700; color: var(--text); z-index: 5; animation: pfloatCard 4s ease-in-out infinite; }
        .phero-float-card .pfc-icon { font-size: 1.3rem; }
        .phero-float-card .pfc-val { color: var(--green); font-weight: 800; }
        .pfc-1 { top: -18px; right: -12px; }
        .pfc-2 { bottom: -15px; left: -18px; animation-delay: -2s; }
        @keyframes pfloatCard { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
        @media (max-width:900px) { .phero-float-card { display: none; } }

        .pconfig-card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 1.5rem; box-shadow: 0 22px 70px rgba(74,85,162,.12); position: relative; z-index: 1; }
        .pconfig-card::before { content:''; position: absolute; inset: -2px; border-radius: inherit; padding: 2px; background: linear-gradient(90deg,var(--brand),var(--brand-2),var(--green),var(--brand-2),var(--brand)); background-size: 300% 100%; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; animation: pmoveBorder 6s linear infinite; }
        .pcmd-box { background: linear-gradient(180deg,#f8faff,#f0f4ff); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1rem; font-family: var(--font-mono); font-size: .85rem; line-height: 1.6; color: var(--text); position: relative; }
        .pcopy-btn { position: absolute; top: .65rem; right: .65rem; background: var(--text); color: #fff; border: none; border-radius: var(--radius); padding: .35rem .6rem; font-size: .75rem; cursor: pointer; }
        .pcopy-btn:hover { background: var(--brand); }

        .pquickstart { padding: 1.5rem 1.5rem 4rem; max-width: 1180px; margin: 0 auto; }
        .pquickstart-label { font-size: .8rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; margin-bottom: .75rem; }
        .ptags { display: flex; flex-wrap: wrap; gap: .5rem; }
        .ptag { background: #fff; border: 1px solid var(--border); border-radius: 999px; padding: .4rem .85rem; font-size: .85rem; color: var(--text-dim); transition: .15s; cursor: default; }
        .ptag:hover { border-color: var(--brand); color: var(--brand); transform: translateY(-2px); }

        .phiw-section { padding: 4rem 1.5rem; max-width: 1200px; margin: 0 auto; position: relative; }
        .phiw-scroll-wrap { position: relative; max-height: 70vh; min-height: 450px; overflow-y: auto; overflow-x: hidden; padding: 1rem 1.25rem 1.5rem; border-radius: var(--radius-xl); background: rgba(255,255,255,.5); backdrop-filter: blur(8px); border: 1px solid var(--border); box-shadow: 0 8px 30px rgba(74,85,162,.06); }
        .phiw-scroll-wrap::-webkit-scrollbar { width: 10px; }
        .phiw-scroll-wrap::-webkit-scrollbar-track { background: rgba(232,238,246,.6); border-radius: 10px; margin: .5rem 0; }
        .phiw-scroll-wrap::-webkit-scrollbar-thumb { background: linear-gradient(180deg,var(--brand) 0%,var(--green) 100%); border-radius: 10px; border: 2px solid rgba(232,238,246,.6); }
        .phiw-scroll-wrap::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg,#3d468a 0%,#238b7f 100%); }
        .phiw-timeline { position: relative; padding-top: 1.5rem; }
        .phiw-timeline::before { content:''; position: absolute; left: 50%; top: 0; bottom: 0; width: 4px; background: rgba(74,85,162,.08); border-radius: 4px; transform: translateX(-50%); }
        .phiw-progress-line { position: absolute; left: 50%; top: 0; width: 4px; border-radius: 4px; transform: translateX(-50%); background: linear-gradient(180deg,var(--brand) 0%,var(--brand-2) 30%,var(--green) 70%,var(--green) 100%); height: 0; z-index: 1; box-shadow: 0 0 12px rgba(74,85,162,.3); transition: height .3s ease-out; }
        .phiw-progress-line::after { content:''; position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%); width: 14px; height: 14px; border-radius: 50%; background: var(--green); box-shadow: 0 0 16px rgba(42,157,143,.5); animation: pprogressPulse 1.5s ease-in-out infinite; }
        @keyframes pprogressPulse { 0%,100%{transform:translateX(-50%) scale(1);opacity:1;} 50%{transform:translateX(-50%) scale(1.4);opacity:.6;} }
        .phiw-row { display: flex; align-items: center; margin-bottom: 3rem; position: relative; }
        .phiw-row:last-child { margin-bottom: 0; }
        .phiw-node { width: 56px; height: 56px; border-radius: 50%; background: #fff; border: 3px solid var(--brand); color: var(--brand); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 800; flex-shrink: 0; position: absolute; left: 50%; transform: translateX(-50%) scale(0); z-index: 10; box-shadow: 0 4px 20px rgba(74,85,162,.15); transition: transform .6s cubic-bezier(.34,1.56,.64,1), box-shadow .3s, opacity .4s ease; opacity: 0; }
        .phiw-row.phiw-visible .phiw-node { transform: translateX(-50%) scale(1) !important; opacity: 1 !important; }
        .phiw-node:hover { transform: translateX(-50%) scale(1.15) !important; box-shadow: 0 6px 25px rgba(74,85,162,.25); }
        .phiw-node.green { border-color: var(--green); color: var(--green); }
        .phiw-node::after { content:''; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid var(--brand); opacity: 0; animation: pnodePulse 2s ease-in-out infinite; }
        .phiw-row.phiw-visible .phiw-node::after { opacity: .4; }
        .phiw-node.green::after { border-color: var(--green); }
        @keyframes pnodePulse { 0%,100%{transform:scale(1);opacity:.4;} 50%{transform:scale(1.35);opacity:0;} }
        .phiw-card { width: calc(50% - 50px); background: #fff; border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 1.75rem; box-shadow: 0 12px 40px rgba(74,85,162,.08); transition: transform .3s, box-shadow .3s, border-color .3s, opacity .6s ease; position: relative; opacity: 0; z-index: 2; }
        .phiw-card::after { content:''; position: absolute; inset: -2px; border-radius: inherit; padding: 2px; background: linear-gradient(90deg,var(--brand),var(--brand-2),var(--green),var(--brand-2),var(--brand)); background-size: 300% 100%; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; opacity: 0; transition: opacity .3s; animation: pmoveBorder 3s linear infinite; }
        .phiw-card:hover::after { opacity: 1; }
        .phiw-row.phiw-left .phiw-card { transform: translateX(-40px); margin-right: auto; }
        .phiw-row.phiw-right .phiw-card { transform: translateX(40px); margin-left: auto; }
        .phiw-row.phiw-visible .phiw-card { opacity: 1 !important; transform: translateX(0) !important; }
        .phiw-card:hover { transform: translateY(-5px) !important; box-shadow: 0 18px 50px rgba(74,85,162,.14); border-color: var(--border-hover); }
        .phiw-card::before { content:''; position: absolute; top: 50%; width: 20px; height: 20px; background: #fff; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); opacity: 0; transition: opacity .6s ease .3s; }
        .phiw-row.phiw-visible .phiw-card::before { opacity: 1; }
        .phiw-row.phiw-left .phiw-card::before { right: -11px; transform: translateY(-50%) rotate(-45deg); }
        .phiw-row.phiw-right .phiw-card::before { left: -11px; transform: translateY(-50%) rotate(135deg); }
        .phiw-card .pstep-tag, .phiw-card h3, .phiw-card p, .phiw-card ul, .phiw-card .pvisual-box, .phiw-card .pstep-cta { opacity: 0; transform: translateY(12px); }
        .phiw-row.phiw-visible .phiw-card .pstep-tag { animation: pitemIn .5s ease .2s forwards; }
        .phiw-row.phiw-visible .phiw-card h3 { animation: pitemIn .5s ease .3s forwards; }
        .phiw-row.phiw-visible .phiw-card p { animation: pitemIn .5s ease .4s forwards; }
        .phiw-row.phiw-visible .phiw-card ul { animation: pitemIn .5s ease .5s forwards; }
        .phiw-row.phiw-visible .phiw-card .pvisual-box { animation: pitemIn .5s ease .6s forwards; }
        .phiw-row.phiw-visible .phiw-card .pstep-cta { animation: pitemIn .5s ease .7s forwards; }
        @keyframes pitemIn { to{opacity:1;transform:translateY(0);} }
        .phiw-card ul li { opacity: 0; transform: translateX(-8px); }
        .phiw-row.phiw-visible .phiw-card ul li { animation: pliPop .4s ease forwards; }
        .phiw-row.phiw-visible .phiw-card ul li:nth-child(1) { animation-delay: .55s; }
        .phiw-row.phiw-visible .phiw-card ul li:nth-child(2) { animation-delay: .65s; }
        .phiw-row.phiw-visible .phiw-card ul li:nth-child(3) { animation-delay: .75s; }
        .phiw-row.phiw-visible .phiw-card ul li:nth-child(4) { animation-delay: .85s; }
        @keyframes pliPop { to{opacity:1;transform:translateX(0);} }
        .pstep-tag { display: inline-flex; align-items: center; gap: .4rem; font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--brand); background: var(--brand-light); padding: .25rem .7rem; border-radius: 999px; margin-bottom: .75rem; }
        .pstep-tag.green { color: var(--green); background: rgba(42,157,143,.10); }
        .phiw-card h3 { font-size: 1.3rem; font-weight: 800; margin-bottom: .5rem; color: var(--text); }
        .phiw-card p { font-size: .95rem; color: var(--text-dim); line-height: 1.6; margin-bottom: .85rem; }
        .phiw-card ul { list-style: none; display: flex; flex-direction: column; gap: .4rem; }
        .phiw-card ul li { display: flex; align-items: center; gap: .5rem; font-size: .85rem; color: var(--text); font-weight: 500; }
        .phiw-card ul li::before { content:''; width: 18px; height: 18px; border-radius: 50%; background: var(--green) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E") center no-repeat; flex-shrink: 0; box-shadow: 0 2px 6px rgba(42,157,143,.2); }
        .pstep-cta { display: inline-flex; margin-top: 1rem; }
        .pvisual-box { background: linear-gradient(180deg,#f8faff,#f0f4ff); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; font-family: var(--font-mono); font-size: .78rem; line-height: 1.7; margin-top: .75rem; color: var(--text-dim); }
        .pv-key { color: var(--brand); font-weight: 700; }
        .pv-ok { color: var(--green); font-weight: 700; }
        .pv-url { color: var(--green); font-weight: 600; }
        .pv-cmt { color: var(--text-muted); }

        .pfeatures { padding: 4rem 1.5rem; max-width: 1100px; margin: 0 auto; }
        .psection-head { text-align: center; margin-bottom: 2.5rem; }
        .psection-head h2 { font-size: clamp(1.8rem,3.5vw,2.6rem); font-weight: 800; margin-bottom: .5rem; }
        .psection-head p { color: var(--text-dim); font-size: 1.05rem; }
        .pfeature-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1.5rem; }
        .pfeature-card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.75rem; transition: transform .3s, box-shadow .3s, border-color .3s; }
        .pfeature-card:hover { transform: translateY(-6px); box-shadow: 0 20px 50px rgba(74,85,162,.12); border-color: rgba(106,166,240,.35); }

        .ppricing { padding: 4rem 1.5rem; max-width: 950px; margin: 0 auto; }
        .ppricing-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 1.5rem; align-items: stretch; max-width: 820px; margin: 0 auto; }
        .pprice-card { background: #fff; border: 1px solid #e6e8f0; border-radius: 20px; padding: 2.25rem 1.85rem; display: flex; flex-direction: column; position: relative; transition: transform .35s, box-shadow .35s; }
        .pprice-card:hover { transform: translateY(-5px); box-shadow: 0 22px 50px rgba(74,85,162,.12); }
        .pprice-card.featured { border: 2px solid #5a63b8; transform: scale(1.02); box-shadow: 0 18px 55px rgba(74,85,162,.15); }
        .pplan-badge { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: #5a63b8; color: #fff; font-size: .65rem; font-weight: 800; padding: .35rem .95rem; border-radius: 999px; text-transform: uppercase; white-space: nowrap; letter-spacing: .03em; }
        .pplan-name { font-size: 1.25rem; font-weight: 800; margin-bottom: .25rem; color: #1a1a2e; }
        .pplan-price { font-size: 2.6rem; font-weight: 900; margin-bottom: .3rem; color: #1a1a2e; display: flex; align-items: flex-end; gap: .15rem; line-height: 1; }
        .pplan-price span { font-size: 1rem; font-weight: 600; color: #6b7280; margin-bottom: .4rem; }
        .pplan-desc { font-size: .95rem; color: #6b7280; margin-bottom: 1.75rem; }
        .pplan-features { list-style: none; flex: 1; margin-bottom: 1.75rem; display: flex; flex-direction: column; gap: .55rem; }
        .pplan-features li { font-size: .92rem; color: #5a5d7a; display: flex; align-items: flex-start; gap: .65rem; line-height: 1.45; }
        .pplan-features li::before { content:''; flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: #e8f6f3 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%232a9d8f' stroke-width='3' stroke-linecap='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") center no-repeat; margin-top: .05rem; }
        .pprice-card .pbtn { border-radius: 12px; padding: .85rem 1.25rem; font-size: .95rem; font-weight: 700; width: 100%; }
        .pprice-card .pbtn-ghost { border: 1.5px solid #d1d5db; color: #4a55a2; background: #fff; }
        .pprice-card .pbtn-ghost:hover { background: #f4f5fb; border-color: #4a55a2; }
        @media (max-width:900px) { .ppricing-grid { grid-template-columns: 1fr; max-width: 420px; } .pprice-card.featured { transform: none; } .pfeature-grid { grid-template-columns: 1fr; } }

        .pfaq { padding: 4rem 1.5rem; max-width: 820px; margin: 0 auto; }
        .pfaq-item { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: .75rem; overflow: hidden; }
        .pfaq-item summary { padding: 1rem 1.25rem; cursor: pointer; font-weight: 700; font-size: .95rem; list-style: none; display: flex; justify-content: space-between; align-items: center; }
        .pfaq-item summary::-webkit-details-marker { display: none; }
        .pfaq-item .pchevron { width: 24px; height: 24px; border-radius: 50%; background: var(--surface-1); display: inline-flex; align-items: center; justify-content: center; color: var(--brand); transition: transform .3s; }
        .pfaq-item[open] .pchevron { transform: rotate(180deg); }
        .pfaq-item .panswer { padding: 0 1.25rem 1.25rem; font-size: .9rem; color: var(--text-dim); line-height: 1.6; }

        .pcta-section { text-align: center; padding: 4rem 2rem; max-width: 850px; margin: 0 auto 4rem; background: linear-gradient(145deg,#ffffff,#f8faff); border-radius: var(--radius-xl); box-shadow: 0 22px 70px rgba(74,85,162,.12); border: 1px solid var(--border); }
        .pcta-section h2 { font-size: 2.2rem; font-weight: 800; margin-bottom: 1rem; }
        .pcta-section p { color: var(--text-dim); margin-bottom: 1.5rem; font-size: 1.05rem; max-width: 520px; margin-left: auto; margin-right: auto; }

        section { scroll-margin-top: 4rem; }
        @media (max-width:768px) {
          .phero { padding: 1.5rem 1rem 2rem; } .phero-title { font-size: 1.8rem; } .phero-sub { font-size: 1rem; }
          .phero-cta-row { flex-direction: column; gap: .5rem; } .phero-cta-row .pbtn { width: 100%; }
          .phero-terminal-body { font-size: .75rem; padding: 1rem .85rem; }
          .pconfig-card { padding: 1rem; }
          .phiw-scroll-wrap { max-height: 75vh; }
          .phiw-timeline::before { left: 28px; } .phiw-progress-line { left: 28px; }
          .phiw-node { left: 28px; width: 48px; height: 48px; font-size: 1.1rem; }
          .phiw-card { width: calc(100% - 70px); margin-left: 70px !important; margin-right: 0 !important; padding: 1.25rem; }
          .phiw-row.phiw-left .phiw-card::before, .phiw-row.phiw-right .phiw-card::before { left: -11px; right: auto; transform: translateY(-50%) rotate(135deg); }
          .pfeature-grid { grid-template-columns: 1fr; }
        }
        @media (max-width:480px) { .phero-title { font-size: 1.5rem; } .pcmd-box { font-size: .72rem; padding: .6rem; } }
      `}</style>

      <section className="phero" id="hero" style={{ paddingTop: '2.5rem' }}>
        <div className="phero-wrap">
          <div className="phero-left">
            <div className="phero-badge"><span className="ppulse-dot" /> No installation required — just SSH</div>
            <h1 className="phero-title">Public URLs for <span className="pgradient-text">Localhost</span></h1>
            <p className="phero-sub">Without downloading any binary!</p>
            <p className="phero-desc">Create HTTP, TCP, UDP, or TLS tunnels to your Mac/PC. Even if it is sitting behind firewalls and NATs. Get a public HTTPS URL in seconds.</p>
            <div className="phero-cta-row">
              <Link to="/login" className="pbtn pbtn-lg pbtn-animated">Start Free Trial →</Link>
              <Link to="/#how-it-works" className="pbtn pbtn-lg pbtn-ghost">See How It Works</Link>
            </div>
            <div className="phero-stats">
              <div className="phero-stat"><div className="pnum">8</div><div className="plbl">Dashboard Pages</div></div>
              <div className="phero-stat"><div className="pnum">3</div><div className="plbl">Payment Methods</div></div>
              <div className="phero-stat"><div className="pnum">∞</div><div className="plbl">Data Transfer</div></div>
            </div>
          </div>
          <div className="phero-preview">
            <div className="phero-float-card pfc-1"><span className="pfc-icon">🔒</span> SSL <span className="pfc-val">Active</span></div>
            <div className="phero-float-card pfc-2"><span className="pfc-icon">⚡</span> <span className="pfc-val">12ms</span> latency</div>
            <div className="phero-terminal">
              <div className="phero-terminal-header">
                <div className="phero-terminal-dots"><span /><span /><span /></div>
                <div className="phero-terminal-title">Terminal — ssh</div>
              </div>
              <div className="phero-terminal-body">
                <div><span className="pt-prompt">$</span> ssh -p 2222 -R0:127.0.0.1:8080</div>
                <div>&nbsp;&nbsp; your-token@ssh.iraglobaltech.com</div>
                <div className="pt-out">Allocated port 45647 for remote forward</div>
                <div className="pt-out">URL: <span className="pt-url">https://abc1234.iraglobaltech.com</span></div>
                <div className="pt-out">SSL: <span className="pt-ok">✓ Cloudflare edge</span></div>
                <div className="pt-out">Status: <span className="pt-ok">● Live</span> · QR: <span className="pt-ok">✓</span></div>
                <div className="pt-cmt"># Share your localhost with anyone</div>
                <div><span className="pt-prompt">$</span><span className="pt-cursor" /></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
        <div className="pconfig-card pglass" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '1rem', alignItems: 'center', padding: '1rem 1.5rem' }}>
          <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em', margin: 0 }}>Try it now:</div>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <select value={proto} onChange={(e) => setProto(e.target.value)} style={{ padding: '.5rem .7rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.85rem', background: '#fff' }}>
              <option value="http">HTTP</option>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
            <input type="text" value={addr} onChange={(e) => setAddr(e.target.value)} style={{ flex: 1, padding: '.5rem .7rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.85rem' }} />
          </div>
          <div className="pcmd-box" style={{ margin: 0, padding: '.6rem 2.75rem .6rem .75rem', fontSize: '.78rem', minWidth: 320 }}>
            <button className="pcopy-btn" onClick={copyCmd}>{copied ? 'Copied!' : 'Copy'}</button>
            <div>{cmd}</div>
          </div>
          <Link to="/login" className="pbtn" style={{ whiteSpace: 'nowrap' }}>Get Token →</Link>
        </div>
      </section>

      <section className="pquickstart" style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: '2.5rem' }}>
        <div className="pquickstart-label">Quickstart guides</div>
        <div className="ptags">
          {['React', 'Next.js', 'Vue', 'Node.js', 'Python', 'FastAPI', 'Flask', 'Django', 'Docker', 'Kubernetes', 'Stripe', 'Webhooks'].map((t) => (
            <span key={t} className="ptag">{t}</span>
          ))}
        </div>
      </section>

      <section className="phiw-section" id="how-it-works" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="psection-head" style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', fontWeight: 800, marginBottom: '.5rem' }}>How It Works — Step by Step</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '1.05rem' }}>Everything you can do with IRAGT, from your first tunnel to advanced team management.</p>
        </div>
        <div className="phiw-scroll-wrap" ref={hiwWrapRef}>
          <div className="phiw-timeline" ref={hiwTimelineRef}>
            <div className="phiw-progress-line" ref={progressRef} />
            {[
              { side: 'left', tag: 'Step 1 · Get Started', green: false, title: 'Sign Up & Log In', text: 'Create your free account in seconds. No credit card required — just enter your email and password.', points: ['Free plan with unlimited data transfer', 'Default credentials: admin / admin', 'Dashboard overview after login'], cta: { text: 'Create Account →', to: '/login' }, visual: [<><span className="pv-key">Welcome!</span> Plan: <span className="pv-ok">Free</span></>, <>Tokens: 1 · Tunnels: 0 · <span className="pv-ok">● Ready</span></>, <div className="pv-cmt"># Start tunneling in seconds</div>] },
              { side: 'right', tag: 'Step 2 · Quickstart Wizard', green: true, title: 'Run Your First Tunnel', text: 'Follow the 5-step guided wizard: copy your token, set a domain, paste the SSH command, and your tunnel is live.', points: ['Copy your unique access token', 'Choose OS (Windows, Mac, Linux)', 'Paste one SSH command in terminal', 'Get a public HTTPS URL instantly'], visual: [<><span className="pv-key">①</span> Get token → <span className="pv-key">②</span> Set domain</>, <><span className="pv-key">③</span> Copy SSH → <span className="pv-key">④</span> Run</>, <><span className="pv-ok">⑤</span> <span className="pv-url">https://abc123.iraglobaltech.com</span></>] },
              { side: 'left', tag: 'Step 3 · Manage Tokens', green: false, title: 'Create Tokens for Each Project', text: 'Each token gets its own subdomain, domain, and port. Perfect for managing multiple projects or environments.', points: ['Unique subdomain per token', 'Custom domain support (Pro)', 'Regenerate or revoke anytime', 'Connection guide for each token'], visual: [<><span className="pv-key">Token:</span> abc12345•••• <span className="pv-ok">● active</span></>, <><span className="pv-key">URL:</span> <span className="pv-url">api.iraglobaltech.com</span></>, <div className="pv-cmt"># Separate tokens per project</div>] },
              { side: 'right', tag: 'Step 4 · Configure & Customize', green: true, title: 'Advanced Tunnel Configuration', text: 'Use the command builder for multi-port tunnels, Docker commands, auto-reconnect, QR codes, and script downloads.', points: ['Multi-port mapping (Pro)', 'Docker command generation', 'Download as .sh, .bat, .command', 'App presets (React, Django, Flask, etc.)'], visual: [<><span className="pv-key">App:</span> React/Vite · <span className="pv-key">Port:</span> :3000</>, <><span className="pv-key">Type:</span> HTTP · <span className="pv-key">Extra:</span> ?qr ?debug</>, <>QR: <span className="pv-ok">✓ Generated</span> <span className="pv-cmt"># Download as .sh/.bat</span></>] },
              { side: 'left', tag: 'Step 5 · Custom Domains', green: false, title: 'Add Your Own Domain', text: "Point your domain's DNS A record to our server, and we'll automatically verify DNS and provision SSL via Let's Encrypt.", points: ['Automatic DNS verification', 'Free SSL/TLS via Let\'s Encrypt', 'Nginx configuration included', 'Multiple domains (Pro)'], visual: [<>DNS: <span className="pv-ok">✓ Verified</span> · SSL: <span className="pv-ok">✓ Active</span></>, <>Nginx: <span className="pv-ok">✓ Configured</span></>, <><span className="pv-key">URL:</span> <span className="pv-url">https://myapp.com</span></>] },
              { side: 'right', tag: 'Step 6 · Monitor & Debug', green: true, title: 'Monitor Active Tunnels', text: 'Watch live traffic, inspect requests, and replay them. Real-time stats for every tunnel session.', points: ['Live request count & data transfer', 'Request inspector with headers & body', 'One-click replay for debugging', '30-day usage analytics'], visual: [<><span className="pv-key">GET</span> /api/users → <span className="pv-ok">200 · 12ms</span></>, <><span className="pv-key">POST</span> /api/login → <span className="pv-ok">200 · 45ms</span></>, <><span className="pv-key">POST</span> /webhook/stripe → <span className="pv-ok">200 · 19ms</span></>] },
              { side: 'left', tag: 'Step 7 · Team & API', green: false, title: 'Collaborate with Teams', text: 'Invite teammates, share Pro seats, share tokens, and manage everything programmatically via API.', points: ['Invite members with roles (admin/member)', 'Share Pro seats across team', 'API keys for CI/CD and Python SDK', 'Track team activity feed'], visual: [<><span className="pv-key">Team:</span> Dev Team (3 members)</>, <><span className="pv-key">Seats:</span> <span className="pv-ok">⭐ 2 / 3 Pro</span></>, <><span className="pv-key">API Key:</span> pk_live_••••</>, <div className="pv-cmt"># Manage via REST or Python SDK</div>] },
              { side: 'right', tag: 'Step 8 · Security & Support', green: true, title: 'Secure & Get Help', text: 'Enable 2FA, manage billing, and get help from the support center with tickets and FAQs.', points: ['Email-based 2FA authentication', 'Billing history & downloadable invoices', 'Support tickets with conversation history', 'Plan upgrades (Free → Pro → Enterprise)'], visual: [<>2FA: <span className="pv-ok">✓ Email OTP enabled</span></>, <>Support: <span className="pv-ok">✓ Tickets + FAQ</span></>, <>Billing: <span className="pv-ok">✓ Invoices & history</span></>] },
            ].map((step, i) => (
              <div key={i} className={`phiw-row phiw-${step.side}`}>
                <div className={`phiw-node ${step.green ? 'green' : ''}`}>{i + 1}</div>
                <div className="phiw-card">
                  <span className={`pstep-tag ${step.green ? 'green' : ''}`}>{step.tag}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  <ul>
                    {step.points.map((pt, idx) => (
                      <li key={idx}>{pt}</li>
                    ))}
                  </ul>
                  {step.cta && <Link to={step.cta.to} className="pbtn pbtn-animated pstep-cta">{step.cta.text}</Link>}
                  <div className="pvisual-box">{step.visual.map((v, idx) => <div key={idx}>{v}</div>)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pfeatures-wrapper" style={{ padding: '1.5rem', marginTop: '2rem', borderRadius: 'var(--radius-xl)' }}>
          <div className="psection-head" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Dashboard Features</h2>
            <p style={{ color: 'var(--text-dim)' }}>17 pages to manage every aspect of your tunnels</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '1rem' }}>
            {[
              ['📊', 'Dashboard Overview', 'Live tunnel status, traffic metrics, domain health'],
              ['🚀', 'Quickstart Wizard', '5-step guided setup for your first tunnel'],
              ['⚙️', 'Configure Tunnel', 'Multi-port, Docker, auto-reconnect, QR codes'],
              ['🔑', 'Manage Tokens', 'CRUD tokens with custom domains & security'],
              ['🌍', 'Custom Domains', 'Auto DNS verification + SSL via Let\'s Encrypt'],
              ['🔗', 'Active Tunnels', 'Live sessions with real-time traffic data'],
              ['🔍', 'Inspector', 'Capture, inspect & replay HTTP requests'],
              ['💻', 'Remote Devices', 'Track machines & keep tunnels always-on'],
              ['📈', 'Usage Analytics', '30-day charts for requests, tunnels & data'],
              ['👥', 'Teams', 'Invite members, share Pro seats & tokens'],
              ['🔐', 'API Keys', 'Programmatic access via REST or Python SDK'],
              ['🛡️', 'Security (2FA)', 'Email-based two-factor authentication'],
              ['💳', 'Billing & Invoices', 'Payments, history & downloadable invoices'],
              ['🎫', 'Support', 'Tickets, conversation history & FAQ'],
              ['📱', 'Announcements', 'Platform news & updates'],
              ['📄', 'API Docs', 'Full REST endpoint reference'],
            ].map(([icon, title, desc]) => (
              <div key={title} className="pfeature-card" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '.5rem' }}>{icon}</div>
                <h3 style={{ fontSize: '.95rem', fontWeight: 700 }}>{title}</h3>
                <p style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ppricing" id="pricing" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="psection-head">
          <h2>Choose a plan that works for you</h2>
          <p>Start free, upgrade when you need more.</p>
        </div>
        <div className="ppricing-grid">
          <div className="pprice-card">
            <div className="pplan-name">Free</div>
            <div className="pplan-price">₹0<span>/month</span></div>
            <div className="pplan-desc">For hobbyists and quick demos</div>
            <ul className="pplan-features">
              <li>Single SSH command tunneling</li>
              <li>HTTP(S) tunnels</li>
              <li>60 minute tunnel timeout</li>
              <li>Random subdomains</li>
              <li>Unlimited data transfer</li>
            </ul>
            <Link to="/login" className="pbtn pbtn-ghost" style={{ width: '100%' }}>Get Started Free</Link>
          </div>
          <div className="pprice-card featured">
            <div className="pplan-badge">Most Popular</div>
            <div className="pplan-name">Pro</div>
            <div className="pplan-price">₹199<span>/month</span></div>
            <div className="pplan-desc">For developers who need persistence</div>
            <ul className="pplan-features">
              <li>Everything in Free</li>
              <li>Persistent tunnels (no timeout)</li>
              <li>Fixed subdomain per token</li>
              <li>1 custom domain</li>
              <li>Multiple tunnels</li>
              <li>Priority support</li>
            </ul>
            <Link to="/login" className="pbtn" style={{ width: '100%' }}>Upgrade to Pro</Link>
          </div>
        </div>
      </section>

      <section className="pfaq" id="faq" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="psection-head">
          <h2>Frequently Asked Questions</h2>
          <p>Quick answers to common questions.</p>
        </div>
        {[
          { q: 'Do I need to install any software?', a: 'No. Any modern OS already includes an SSH client. Windows 10+, macOS, and Linux all work out of the box.' },
          { q: 'Is my tunnel URL permanent?', a: 'On the Free plan URLs are random per session. Pro and Enterprise plans keep the same subdomain for every token.' },
          { q: 'Can I use my own domain?', a: 'Yes. Pro includes one custom domain; Enterprise includes unlimited custom domains plus Cloudflare-managed SSL.' },
          { q: 'Does it work on all platforms?', a: 'Yes — Linux, Windows, macOS, and Android are all supported through the built-in SSH client.' },
        ].map((item) => (
          <details key={item.q} className="pfaq-item">
            <summary>
              <span>{item.q}</span>
              <span className="pchevron">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </summary>
            <div className="panswer">{item.a}</div>
          </details>
        ))}
      </section>

      <section className="pcta-section" style={{ margin: '1rem auto 3rem', maxWidth: 1200 }}>
        <h2>Ready to share your localhost?</h2>
        <p>Start tunneling in seconds. No credit card required, no client to install — just one SSH command.</p>
        <Link to="/login" className="pbtn pbtn-lg pbtn-animated">Get Started Free →</Link>
      </section>
    </PublicLayout>
  );
}
