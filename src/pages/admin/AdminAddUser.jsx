import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';

// Admin: Add User — create an account directly (user or admin role).
// API: POST /auth/register { email, password, full_name, role }

export default function AdminAddUser() {
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('user');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!email || !password) { toast('Email and password required', 'error'); return; }
    if (password.length < 4) { toast('Password must be at least 4 characters', 'error'); return; }
    setBusy(true);
    try {
      await api('/auth/register', 'POST', {
        email, password,
        full_name: fullName || undefined,
        role,
      });
      toast(`User ${email} created (${role})`);
      navigate('/dashboard/admin/users');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-title">Add User</div>
      <div className="page-subtitle">Create an account directly — no signup email needed</div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-body">
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Email / Username</label>
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 4 characters" />
            </div>
            <div className="form-group">
              <label>Full name (optional)</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="user">user — normal account</option>
                <option value="admin">admin — full panel access</option>
              </select>
            </div>
            <button className="btn" style={{ width: '100%', marginTop: '.5rem' }} disabled={busy}>
              {busy ? 'Creating…' : '➕ Create User'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}