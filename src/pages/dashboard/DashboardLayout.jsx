import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';

const NAV_ITEMS = [
  { to: '', label: 'Dashboard', icon: 'M3 13h8V3H3v10zm10 8h8V3h-8v18zM3 21h8v-6H3v6z', end: true },
  { to: 'quickstart', label: 'Quickstart', icon: 'M13 2 3 14h9l-1 8 10-12h-9l1-8' },
  { sep: true },
  { to: 'configure', label: 'Configure Tunnel', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z' },
  { to: 'domains', label: 'Domains', icon: 'M2 12h20M12 2a15.3 15.3 0 010 20 15.3 15.3 0 010-20z' },
  { to: 'tunnels', label: 'Active Tunnels', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { to: 'devices', label: 'Remote Devices', icon: 'M2 3h20v14H2zM8 21h8M12 17v4' },
  { to: 'inspector', label: 'Inspector', icon: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35' },
  { to: 'tokens', label: 'Manage Tokens', icon: 'M3 11h18v11H3zM7 11V7a5 5 0 0110 0v4' },
  { to: 'apikeys', label: 'API Keys', icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
  { to: 'apidocs', label: 'API Docs', icon: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z' },
  { to: 'usage', label: 'My Usage', icon: 'M18 20V10M12 20V4M6 20v-6' },
  { to: 'announcements', label: 'Announcements', icon: 'M3 11l18-5v12L3 13z' },
  { to: 'teams', label: 'Teams', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 110 8 4 4 0 010-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  { to: 'support', label: 'Support', icon: 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01' },
  { to: 'plan', label: 'Plan', icon: 'M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2z' },
  { sep: true },
  { to: 'subscription', label: 'Billing & Invoices', icon: 'M1 4h22v16H1zM1 10h22' },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">⚡ IRAGT</div>
        <div className="topbar-user">
          <div className="avatar">{(user?.email || 'U')[0].toUpperCase()}</div>
          <span>{user?.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-nav">
          {NAV_ITEMS.map((item, i) =>
            item.sep ? (
              <div key={`sep-${i}`} className="nav-sep" />
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d={item.icon} />
                </svg>
                {item.label}
              </NavLink>
            )
          )}
        </nav>

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      {/* Payment redirect feedback — mirrors legacy showApp() behavior */}
      <PaymentRedirectEffect />
    </div>
  );
}

// Handles /dashboard?payment=success|cancel — the legacy showApp() toast behavior
function PaymentRedirectEffect() {
  const toast = useToast();
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');

  if (payment) {
    // Clear the param from the URL so refresh doesn't re-trigger
    window.history.replaceState({}, '', '/dashboard');
    if (payment === 'success') {
      toast('🎉 Payment successful! Your Pro plan is being activated.');
    } else if (payment === 'cancel') {
      toast('Payment cancelled — no charge was made', 'error');
    }
  }
  return null;
}