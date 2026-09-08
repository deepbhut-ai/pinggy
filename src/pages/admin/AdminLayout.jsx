import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';

// Admin panel — React rebuild of the legacy app/static/admin.html
// All sections live under /dashboard/admin/* (admin-only, guarded below).

const ADMIN_NAV = [
  { to: '', label: '📊 Dashboard', end: true },
  { sep: true },
  { to: 'users', label: '👥 Users' },
  { to: 'add-user', label: '➕ Add User' },
  { to: 'tokens', label: '🔑 All Tokens' },
  { to: 'tunnels', label: '🔗 All Tunnels' },
  { sep: true },
  { to: 'payments', label: '💳 Payments' },
  { to: 'invoices', label: '🧾 Invoices' },
  { to: 'plans', label: '💎 Plans' },
  { sep: true },
  { to: 'ipmonitor', label: '🛡️ IP Monitor' },
  { to: 'audit', label: '📋 Audit Log' },
  { to: 'tickets', label: '🎫 Tickets' },
  { sep: true },
  { to: 'settings', label: '⚙️ Settings' },
  { to: 'coupons', label: '🎟️ Coupons' },
  { to: 'announcements', label: '📣 Announcements' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  // Admin-only guard — non-admins never see the panel
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') {
      toast('Admin access required', 'error');
      navigate('/dashboard', { replace: true });
      return;
    }
    setChecked(true);
  }, [user, navigate, toast]);

  if (!checked) return <div className="loading-screen">Checking admin access…</div>;
  if (!user) return null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">⚡ IRAGT <span className="badge badge-green" style={{ marginLeft: '.5rem' }}>ADMIN</span></div>
        <div className="topbar-user">
          <div className="avatar">{(user.email || 'A')[0].toUpperCase()}</div>
          <span>{user.email} (admin)</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>← User Dashboard</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login', { replace: true }); }}>Logout</button>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-nav">
          {ADMIN_NAV.map((item, i) =>
            item.sep ? (
              <div key={`sep-${i}`} className="nav-sep" />
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            )
          )}
        </nav>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}