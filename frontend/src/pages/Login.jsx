import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { postPublic } from '../api/client';

const MODES = { LOGIN: 'login', SIGNUP: 'signup', FORGOT: 'forgot', RESET: 'reset' };

export default function Login() {
  const { login, verifyOtp, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState(MODES.LOGIN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpChallenge, setOtpChallenge] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.search).get('reset')
  );
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const dest = (user) => (user.role === 'admin' ? '/admin' : '/dashboard');

  // ---- Login (with 2FA step) ----
  const handleLogin = async (e) => {
    e?.preventDefault();
    setError(''); setSuccess('');
    if (!email || !password) { setError('Please enter email and password'); return; }
    if (otpChallenge) {
      if (!otpCode) { setError('Enter the 6-digit code from your email'); return; }
      setBusy(true);
      try {
        const data = await verifyOtp(otpChallenge, otpCode);
        navigate(dest(data.user), { replace: true });
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const data = await login(email, password);
      if (data.otp_required) {
        setOtpChallenge(data.challenge);
        setSuccess('We sent a 6-digit code to your email (expires in 5 min).');
        return;
      }
      navigate(dest(data.user), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Signup ----
  const handleSignup = async (e) => {
    e?.preventDefault();
    setError(''); setSuccess('');
    if (!email || !password) { setError('Please enter email and password'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters'); return; }
    setBusy(true);
    try {
      await register(email, password, fullName);
      // Auto-login after signup (mirrors legacy doLoginAfterRegister)
      const data = await login(email, password);
      if (data.otp_required) {
        // Rare: 2FA pre-enabled — fall back to login screen with challenge
        setMode(MODES.LOGIN);
        setOtpChallenge(data.challenge);
        setSuccess('Account created! Enter the code from your email.');
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Forgot password ----
  const handleForgot = async (e) => {
    e?.preventDefault();
    setError(''); setSuccess('');
    if (!email) { setError('Enter your email'); return; }
    setBusy(true);
    try {
      const data = await postPublic('/auth/forgot-password', { email });
      setSuccess(data.detail + ' If SMTP is off, the admin can retrieve the link from email logs.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Reset password (arriving via ?reset=TOKEN link) ----
  const handleReset = async (e) => {
    e?.preventDefault();
    setError(''); setSuccess('');
    if (!newPassword || newPassword.length < 4) { setError('Enter a password (min 4 chars)'); return; }
    setBusy(true);
    try {
      const data = await postPublic('/auth/reset-password', { token: resetToken, new_password: newPassword });
      setSuccess(data.detail + ' Redirecting to login…');
      setTimeout(() => { setResetToken(null); setMode(MODES.LOGIN); }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const input = (value, onChange, type = 'text', placeholder, extraProps = {}) => (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...extraProps} />
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo">⚡ IRAGT</div>
        <div className="subtitle">Secure tunnels to localhost</div>

        {resetToken ? (
          /* ---------- RESET PASSWORD ---------- */
          <form className="auth-form" onSubmit={handleReset}>
            <div className="form-group">
              <label>New Password</label>
              {input(newPassword, setNewPassword, 'password', 'Min 4 characters')}
            </div>
            {error && <div className="auth-error">{error}</div>}
            {success && <div className="auth-success">{success}</div>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
        ) : mode === MODES.FORGOT ? (
          /* ---------- FORGOT PASSWORD ---------- */
          <form className="auth-form" onSubmit={handleForgot}>
            <div className="form-group">
              <label>Email</label>
              {input(email, setEmail, 'email', 'user@example.com')}
            </div>
            {error && <div className="auth-error">{error}</div>}
            {success && <div className="auth-success">{success}</div>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send Reset Link'}
            </button>
            <p className="auth-note">If SMTP is not configured, ask the admin to reset your password.</p>
            <p className="auth-note">
              <a href="#" onClick={(e) => { e.preventDefault(); setMode(MODES.LOGIN); }}>← Back to Login</a>
            </p>
          </form>
        ) : mode === MODES.SIGNUP ? (
          /* ---------- SIGNUP ---------- */
          <form className="auth-form" onSubmit={handleSignup}>
            <div className="form-group">
              <label>Email</label>
              {input(email, setEmail, 'email', 'user@example.com')}
            </div>
            <div className="form-group">
              <label>Password</label>
              {input(password, setPassword, 'password', 'Min 4 characters')}
            </div>
            <div className="form-group">
              <label>Full Name (optional)</label>
              {input(fullName, setFullName, 'text', 'John Doe')}
            </div>
            {error && <div className="auth-error">{error}</div>}
            {success && <div className="auth-success">{success}</div>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create Account'}
            </button>
            <p className="auth-note">
              Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode(MODES.LOGIN); }}>Login</a>
            </p>
          </form>
        ) : (
          /* ---------- LOGIN (with 2FA step) ---------- */
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email</label>
              {input(email, setEmail, 'email', 'user@example.com')}
            </div>
            {!otpChallenge && (
              <div className="form-group">
                <label>Password</label>
                {input(password, setPassword, 'password', 'Password')}
              </div>
            )}
            {otpChallenge && (
              <div className="form-group">
                <label>Verification code</label>
                {input(otpCode, setOtpCode, 'text', '6-digit code from your email', { maxLength: 6, inputMode: 'numeric', autoComplete: 'one-time-code' })}
                <p className="auth-note">We sent a 6-digit code to your email (expires in 5 min).</p>
              </div>
            )}
            {error && <div className="auth-error">{error}</div>}
            {success && <div className="auth-success">{success}</div>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : otpChallenge ? 'Verify & Login' : 'Login'}
            </button>
            <p className="auth-note">
              <a href="#" onClick={(e) => { e.preventDefault(); setMode(MODES.FORGOT); }}>Forgot password?</a>
              {' · Don\u2019t have an account? '}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode(MODES.SIGNUP); }}>Sign up</a>
            </p>
          </form>
        )}

        <div className="back-link">
          <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }}>← Back to home</a>
        </div>
      </div>
    </div>
  );
}