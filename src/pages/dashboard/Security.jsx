import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

// Security page — Two-Factor Authentication (email OTP) management.
// The login flow itself (password → email code → verify) lives in Login.jsx.
export default function Security() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [twofa, setTwofa] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // 'enable' | 'disable'

  const load = useCallback(async () => {
    try {
      const res = await api('/auth/2fa');
      setTwofa(!!res.twofa_enabled);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const apply = async (enable) => {
    setBusy(true);
    try {
      const res = await api('/auth/2fa', 'PUT', { enabled: enable });
      setTwofa(!!res.twofa_enabled);
      setConfirmModal(null);
      toast(enable ? '✅ Two-Factor Authentication enabled — you will receive an email code at every login' : 'Two-Factor Authentication disabled');
      refreshUser();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-title">Security</div>
      <div className="page-subtitle">Protect your account with an extra verification step</div>

      {/* ---- 2FA card ---- */}
      <div className="card">
        <div className="card-header">
          <h2>🔐 Two-Factor Authentication</h2>
          {twofa !== null && (
            <span className={`badge ${twofa ? 'badge-green' : ''}`}>{twofa ? '✅ Enabled' : 'Disabled'}</span>
          )}
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '1.6rem' }}>📧</div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <p style={{ fontSize: '.9rem', marginBottom: '.4rem' }}>
                <strong>Email verification code</strong> at every login
              </p>
              <p className="dim" style={{ fontSize: '.82rem', lineHeight: 1.6 }}>
                After entering your password, we email you a 6-digit code (valid 5 minutes).
                You must enter the code to finish logging in. Codes are sent to:
                <strong style={{ color: 'var(--text)' }}> {user?.email}</strong>
              </p>
              <ul style={{ fontSize: '.82rem', color: 'var(--text-dim)', lineHeight: 1.8, marginTop: '.5rem', paddingLeft: '1.1rem' }}>
                <li>Protects your account even if your password leaks</li>
                <li>Works from any device — no app to install</li>
                <li>Codes expire after 5 minutes</li>
              </ul>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 160 }}>
              {twofa === null ? (
                <button className="btn btn-ghost" disabled>Loading…</button>
              ) : twofa ? (
                <button className="btn btn-danger" onClick={() => setConfirmModal('disable')} disabled={busy}>
                  Disable 2FA
                </button>
              ) : (
                <button className="btn" onClick={() => setConfirmModal('enable')} disabled={busy}>
                  Enable 2FA
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- How it works ---- */}
      <div className="card">
        <div className="card-header"><h2>ℹ️ How login works with 2FA</h2></div>
        <div className="card-body" style={{ fontSize: '.85rem', color: 'var(--text-dim)', lineHeight: 1.9 }}>
          <span style={{ color: 'var(--text)' }}>1.</span> Enter your email and password as usual<br />
          <span style={{ color: 'var(--text)' }}>2.</span> We email you a 6-digit verification code<br />
          <span style={{ color: 'var(--text)' }}>3.</span> Enter the code on the login screen — done ✅<br /><br />
          <strong style={{ color: 'var(--text)' }}>⚠️ Important:</strong> make sure you can always access your email inbox.
          If you lose access to your email, you will not be able to log in with 2FA enabled.
          To recover, contact support from the email registered on your account.
        </div>
      </div>

      {/* ---- Confirm modal ---- */}
      {confirmModal && (
        <Modal
          title={confirmModal === 'enable' ? 'Enable Two-Factor Authentication?' : 'Disable Two-Factor Authentication?'}
          confirmLabel={confirmModal === 'enable' ? 'Enable 2FA' : 'Disable 2FA'}
          onConfirm={() => apply(confirmModal === 'enable')}
          onClose={() => setConfirmModal(null)}
        >
          {confirmModal === 'enable' ? (
            <>
              <p className="dim" style={{ fontSize: '.85rem' }}>
                Every login will require a 6-digit code emailed to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>.
              </p>
              <p className="dim" style={{ fontSize: '.85rem' }}>
                ⚠️ Make sure you can access this inbox — otherwise you won't be able to log in.
              </p>
            </>
          ) : (
            <p className="dim" style={{ fontSize: '.85rem' }}>
              Your account will be protected by password only. Anyone with your password will be able to log in.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}