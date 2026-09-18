import { useState, useEffect } from 'react';

export default function MultiportActivationModal({
  domain,
  initialPort = '8080',
  onEnable,
  onSkip,
}) {
  const [port, setPort] = useState(initialPort);
  const [busy, setBusy] = useState(false);

  const presets = ['8080', '3000', '8000', '5173', '4000', '5000'];

  const handleEnable = async () => {
    const targetPort = (port || '8080').trim();
    if (!targetPort) return;
    try {
      setBusy(true);
      await onEnable(targetPort);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onSkip?.();
      } else if (e.key === 'Enter' && !busy && port) {
        handleEnable();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, port, onSkip]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1.25rem',
        animation: 'mpFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={onSkip}
    >
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          color: 'var(--text, #1a1a2e)',
          borderRadius: '20px',
          maxWidth: '520px',
          width: '100%',
          padding: '2.2rem',
          boxShadow: '0 30px 70px -12px rgba(74, 85, 162, 0.35), 0 0 0 1px rgba(74, 85, 162, 0.15)',
          position: 'relative',
          overflow: 'hidden',
          animation: 'mpSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Highlight Bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '5px',
            background: 'linear-gradient(90deg, #4a55a2 0%, #2a9d8f 50%, #6366f1 100%)',
          }}
        />

        {/* Close (X) button */}
        <button
          onClick={onSkip}
          disabled={busy}
          title="Close (Esc)"
          style={{
            position: 'absolute',
            top: '1.1rem',
            right: '1.1rem',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--surface-1, #f4f5fb)',
            border: '1px solid var(--border, rgba(74,85,162,0.12))',
            color: 'var(--text-dim, #5a5d7a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '1rem',
            lineHeight: 1,
            transition: 'background .15s, transform .15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2, #e8eaf6)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-1, #f4f5fb)')}
        >
          ✕
        </button>

        {/* Header Section */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.4rem' }}>
          <div
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(74,85,162,0.15) 0%, rgba(42,157,143,0.2) 100%)',
              color: 'var(--brand, #4a55a2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem',
              flexShrink: 0,
              boxShadow: '0 6px 16px rgba(74,85,162,0.15)',
              border: '1px solid rgba(74,85,162,0.15)',
            }}
          >
            🚀
          </div>
          <div style={{ flex: 1, paddingRight: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.3rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text, #1a1a2e)', margin: 0, letterSpacing: '-0.3px' }}>
                Enable in Multi-Port Tunnel?
              </h3>
              <span
                style={{
                  background: 'rgba(42,157,143,0.12)',
                  color: 'var(--green, #2a9d8f)',
                  border: '1px solid rgba(42,157,143,0.25)',
                  fontSize: '.68rem',
                  fontWeight: 700,
                  padding: '.15rem .55rem',
                  borderRadius: '12px',
                  letterSpacing: '.4px',
                  textTransform: 'uppercase',
                }}
              >
                ⚡ Live Auto-Sync
              </span>
            </div>
            <p style={{ fontSize: '.88rem', color: 'var(--text-dim, #5a5d7a)', margin: 0, lineHeight: 1.45 }}>
              🎉 <strong style={{ color: 'var(--text, #1a1a2e)' }}>{domain}</strong> is now registered & verified!
            </p>
          </div>
        </div>

        {/* Live Visual Traffic Routing Card */}
        <div
          style={{
            background: 'linear-gradient(180deg, var(--surface-1, #f4f5fb) 0%, var(--surface-2, #e8eaf6) 100%)',
            borderRadius: '14px',
            border: '1px solid var(--border, rgba(74,85,162,0.15))',
            padding: '1.1rem 1.25rem',
            marginBottom: '1.4rem',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              fontSize: '.72rem',
              fontWeight: 700,
              color: 'var(--text-muted, #8b8fa8)',
              marginBottom: '.65rem',
              textTransform: 'uppercase',
              letterSpacing: '.6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Live Traffic Routing Preview</span>
            <span style={{ color: 'var(--green, #2a9d8f)', display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green, #2a9d8f)', display: 'inline-block' }} />
              Zero-Restart
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '.75rem',
              flexWrap: 'wrap',
            }}
          >
            {/* Domain Box */}
            <div
              style={{
                flex: '1 1 auto',
                minWidth: '160px',
                background: 'var(--surface, #ffffff)',
                border: '1px solid var(--border, rgba(74,85,162,0.15))',
                borderRadius: '10px',
                padding: '.55rem .85rem',
                fontSize: '.85rem',
                fontWeight: 600,
                color: 'var(--brand, #4a55a2)',
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                wordBreak: 'break-all',
              }}
            >
              <span>🌐</span>
              <span>https://{domain}</span>
            </div>

            {/* Pulsing Arrow */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--green, #2a9d8f)',
                fontWeight: 900,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}
            >
              ➔
            </div>

            {/* Localhost Box */}
            <div
              style={{
                flex: '1 1 auto',
                minWidth: '140px',
                background: 'var(--surface, #ffffff)',
                border: '1.5px solid rgba(42,157,143,0.35)',
                borderRadius: '10px',
                padding: '.55rem .85rem',
                fontSize: '.85rem',
                fontWeight: 700,
                color: 'var(--text, #1a1a2e)',
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
                boxShadow: '0 2px 6px rgba(42,157,143,0.08)',
              }}
            >
              <span>💻</span>
              <span>
                localhost:<span style={{ color: 'var(--green, #2a9d8f)', fontWeight: 800 }}>{port || '8080'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Local Port Input & Presets */}
        <div style={{ marginBottom: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.45rem' }}>
            <label style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text, #1a1a2e)' }}>
              Forward to Local Port on your computer:
            </label>
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted, #8b8fa8)' }}>1 – 65535</span>
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                position: 'absolute',
                left: '.9rem',
                color: 'var(--brand, #4a55a2)',
                fontSize: '1rem',
                fontWeight: 800,
              }}
            >
              :
            </span>
            <input
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="8080"
              style={{
                width: '100%',
                paddingLeft: '1.75rem',
                paddingRight: '1rem',
                height: '44px',
                fontSize: '1rem',
                fontWeight: 700,
                borderRadius: '10px',
                border: '1.5px solid var(--border, rgba(74,85,162,0.22))',
                background: 'var(--surface, #ffffff)',
                color: 'var(--text, #1a1a2e)',
                outline: 'none',
                transition: 'border-color .15s, box-shadow .15s',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--brand, #4a55a2)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border, rgba(74,85,162,0.22))')}
              autoFocus
            />
          </div>

          {/* Preset Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.75rem', color: 'var(--text-dim, #5a5d7a)', marginRight: '.2rem' }}>Quick ports:</span>
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPort(p)}
                style={{
                  background: port === p ? 'var(--brand, #4a55a2)' : 'var(--surface-1, #f4f5fb)',
                  color: port === p ? '#ffffff' : 'var(--text-dim, #5a5d7a)',
                  border: port === p ? '1px solid var(--brand, #4a55a2)' : '1px solid var(--border, rgba(74,85,162,0.12))',
                  borderRadius: '6px',
                  padding: '.2rem .55rem',
                  fontSize: '.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all .15s ease',
                }}
              >
                :{p}
              </button>
            ))}
          </div>

          <p style={{ fontSize: '.78rem', color: 'var(--text-dim, #5a5d7a)', marginTop: '.6rem', lineHeight: 1.45, margin: '.6rem 0 0 0' }}>
            💡 Requests to <code style={{ color: 'var(--brand, #4a55a2)', fontWeight: 600 }}>https://{domain}</code> will instantly route to this local port without interrupting your running tunnel.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '.85rem', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '.5rem', borderTop: '1px solid var(--border, rgba(74,85,162,0.08))' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onSkip}
            disabled={busy}
            style={{
              padding: '.65rem 1.25rem',
              fontSize: '.88rem',
              fontWeight: 600,
              borderRadius: '10px',
              cursor: 'pointer',
              color: 'var(--text-dim, #5a5d7a)',
              background: 'transparent',
              border: 'none',
              transition: 'background .15s, color .15s',
            }}
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy || !port}
            style={{
              background: 'linear-gradient(135deg, var(--brand, #4a55a2) 0%, #3d468a 100%)',
              color: '#ffffff',
              padding: '.68rem 1.4rem',
              fontSize: '.92rem',
              fontWeight: 700,
              borderRadius: '10px',
              border: 'none',
              cursor: busy || !port ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.5rem',
              boxShadow: '0 6px 18px rgba(74,85,162,0.32)',
              opacity: busy || !port ? 0.7 : 1,
              transition: 'transform .1s, box-shadow .15s, opacity .15s',
            }}
          >
            {busy ? (
              <>
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'mpSpin 0.6s linear infinite',
                  }}
                />
                <span>Enabling…</span>
              </>
            ) : (
              <>
                <span>✅</span>
                <span>Yes, Enable in Multi-Port</span>
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes mpFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes mpSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes mpSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
