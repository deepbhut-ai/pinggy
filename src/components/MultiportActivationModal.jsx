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
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
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
          borderRadius: '22px',
          maxWidth: '560px',
          width: '100%',
          padding: '2.2rem',
          boxShadow: '0 32px 80px -16px rgba(74, 85, 162, 0.35), 0 0 0 1px rgba(74, 85, 162, 0.15)',
          position: 'relative',
          overflow: 'hidden',
          animation: 'mpSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Gradient Line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
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
            top: '1.2rem',
            right: '1.2rem',
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
            fontSize: '.95rem',
            lineHeight: 1,
            transition: 'all .15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-2, #e8eaf6)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface-1, #f4f5fb)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ✕
        </button>

        {/* Header Section */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.35rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(74,85,162,0.14) 0%, rgba(42,157,143,0.18) 100%)',
              color: 'var(--brand, #4a55a2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.55rem',
              flexShrink: 0,
              boxShadow: '0 4px 14px rgba(74,85,162,0.14)',
              border: '1px solid rgba(74,85,162,0.12)',
            }}
          >
            🚀
          </div>
          <div style={{ flex: 1, paddingRight: '1.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.25rem' }}>
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
            <p style={{ fontSize: '.86rem', color: 'var(--text-dim, #5a5d7a)', margin: 0, lineHeight: 1.45 }}>
              🎉 <strong style={{ color: 'var(--text, #1a1a2e)' }}>{domain}</strong> is now registered & verified!
            </p>
          </div>
        </div>

        {/* Live Visual Traffic Routing Pipeline Card */}
        <div
          style={{
            background: 'linear-gradient(180deg, var(--surface-1, #f4f5fb) 0%, var(--surface-2, #e8eaf6) 100%)',
            borderRadius: '16px',
            border: '1px solid var(--border, rgba(74,85,162,0.15))',
            padding: '1.1rem 1.25rem',
            marginBottom: '1.35rem',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              fontSize: '.72rem',
              fontWeight: 700,
              color: 'var(--text-muted, #8b8fa8)',
              marginBottom: '.75rem',
              textTransform: 'uppercase',
              letterSpacing: '.6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Live Traffic Routing Pipeline</span>
            <span style={{ color: 'var(--green, #2a9d8f)', display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.72rem', fontWeight: 700 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green, #2a9d8f)', display: 'inline-block' }} />
              Zero-Restart Sync
            </span>
          </div>

          {/* Connected Pipeline Stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {/* Top Node: Public URL */}
            <div
              style={{
                background: 'var(--surface, #ffffff)',
                border: '1.5px solid var(--border, rgba(74,85,162,0.18))',
                borderRadius: '12px',
                padding: '.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '.75rem',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>🌐</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--text-muted, #8b8fa8)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.4px' }}>
                    Public Ingress Domain
                  </div>
                  <div
                    style={{
                      fontSize: '.92rem',
                      fontWeight: 700,
                      color: 'var(--brand, #4a55a2)',
                      wordBreak: 'break-all',
                    }}
                  >
                    https://{domain}
                  </div>
                </div>
              </div>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  fontSize: '.7rem',
                  fontWeight: 700,
                  padding: '.2rem .5rem',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                🔒 SSL Active
              </span>
            </div>

            {/* Connecting Stream Line & Flow Indicator */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '.35rem 0',
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.4rem',
                  background: 'var(--surface, #ffffff)',
                  border: '1px solid rgba(42,157,143,0.3)',
                  padding: '.15rem .65rem',
                  borderRadius: '20px',
                  fontSize: '.72rem',
                  fontWeight: 700,
                  color: 'var(--green, #2a9d8f)',
                  boxShadow: '0 2px 6px rgba(42,157,143,0.1)',
                  zIndex: 2,
                }}
              >
                <span>⬇</span>
                <span>Forwards traffic instantly to</span>
              </div>
            </div>

            {/* Bottom Node: Local Target */}
            <div
              style={{
                background: 'var(--surface, #ffffff)',
                border: '1.5px solid rgba(42,157,143,0.4)',
                borderRadius: '12px',
                padding: '.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '.75rem',
                boxShadow: '0 3px 8px rgba(42,157,143,0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>💻</span>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--text-muted, #8b8fa8)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.4px' }}>
                    Local Machine Target
                  </div>
                  <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text, #1a1a2e)' }}>
                    localhost:<span style={{ color: 'var(--green, #2a9d8f)', fontWeight: 800 }}>{port || '8080'}</span>
                  </div>
                </div>
              </div>
              <span
                style={{
                  background: 'rgba(74, 85, 162, 0.08)',
                  color: 'var(--brand, #4a55a2)',
                  border: '1px solid rgba(74, 85, 162, 0.2)',
                  fontSize: '.7rem',
                  fontWeight: 700,
                  padding: '.2rem .5rem',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Port :{port || '8080'}
              </span>
            </div>
          </div>
        </div>

        {/* Local Port Input & Presets */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.4rem' }}>
            <label style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text, #1a1a2e)' }}>
              Target Local Port on your computer:
            </label>
            <span style={{ fontSize: '.74rem', color: 'var(--text-muted, #8b8fa8)' }}>1 – 65535</span>
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
              className="mp-no-spinner"
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
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--brand, #4a55a2)';
                e.target.style.boxShadow = '0 0 0 3px rgba(74,85,162,0.12)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border, rgba(74,85,162,0.22))';
                e.target.style.boxShadow = 'none';
              }}
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
                  border: port === p ? '1px solid var(--brand, #4a55a2)' : '1px solid var(--border, rgba(74,85,162,0.14))',
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

          <p style={{ fontSize: '.78rem', color: 'var(--text-dim, #5a5d7a)', marginTop: '.55rem', lineHeight: 1.45, margin: '.55rem 0 0 0' }}>
            💡 Requests to <code style={{ color: 'var(--brand, #4a55a2)', fontWeight: 600 }}>https://{domain}</code> will instantly forward to this local port without restarting your tunnel session.
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
                <span>🚀</span>
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
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes mpSpin {
          to { transform: rotate(360deg); }
        }
        .mp-no-spinner::-webkit-inner-spin-button,
        .mp-no-spinner::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .mp-no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}
