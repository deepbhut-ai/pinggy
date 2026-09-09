import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import PublicHelpCenter from './pages/PublicHelpCenter';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import DashboardOverview from './pages/dashboard/DashboardOverview';
import Quickstart from './pages/dashboard/Quickstart';
import ConfigureTunnel from './pages/dashboard/ConfigureTunnel';
import Domains from './pages/dashboard/Domains';
import ActiveTunnels from './pages/dashboard/ActiveTunnels';
import RemoteDevices from './pages/dashboard/RemoteDevices';
import Inspector from './pages/dashboard/Inspector';
import ManageTokens from './pages/dashboard/ManageTokens';
import ApiKeys from './pages/dashboard/ApiKeys';
import ApiDocs from './pages/dashboard/ApiDocs';
import MyUsage from './pages/dashboard/MyUsage';
import Announcements from './pages/dashboard/Announcements';
import Teams from './pages/dashboard/Teams';
import Support from './pages/dashboard/Support';
import Billing from './pages/dashboard/Billing';
import Plan from './pages/dashboard/Plan';
import Security from './pages/dashboard/Security';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminAddUser from './pages/admin/AdminAddUser';
import AdminTokens from './pages/admin/AdminTokens';
import AdminTunnels from './pages/admin/AdminTunnels';
import AdminPayments from './pages/admin/AdminPayments';
import AdminInvoices from './pages/admin/AdminInvoices';
import AdminPlans from './pages/admin/AdminPlans';
import AdminIpMonitor from './pages/admin/AdminIpMonitor';
import AdminAudit from './pages/admin/AdminAudit';
import AdminTickets from './pages/admin/AdminTickets';
import AdminSettings from './pages/admin/AdminSettings';
import AdminCoupons from './pages/admin/AdminCoupons';
import AdminAnnouncements from './pages/admin/AdminAnnouncements';
import AdminEmailTemplates from './pages/admin/AdminEmailTemplates';

// Route guard — replaces all the legacy token/bfcache checks
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/help-center" element={<PublicHelpCenter />} />
      <Route path="/support" element={<PublicHelpCenter />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardOverview />} />
        <Route path="quickstart" element={<Quickstart />} />
        <Route path="configure" element={<ConfigureTunnel />} />
        <Route path="domains" element={<Domains />} />
        <Route path="tunnels" element={<ActiveTunnels />} />
        <Route path="devices" element={<RemoteDevices />} />
        <Route path="inspector" element={<Inspector />} />
        <Route path="tokens" element={<ManageTokens />} />
        <Route path="apikeys" element={<ApiKeys />} />
        <Route path="apidocs" element={<ApiDocs />} />
        <Route path="usage" element={<MyUsage />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="teams" element={<Teams />} />
        <Route path="support" element={<Support />} />
        <Route path="security" element={<Security />} />
        <Route path="plan" element={<Plan />} />
        <Route path="subscription" element={<Billing />} />
      </Route>
      <Route
        path="/dashboard/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="add-user" element={<AdminAddUser />} />
        <Route path="tokens" element={<AdminTokens />} />
        <Route path="tunnels" element={<AdminTunnels />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="invoices" element={<AdminInvoices />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="ipmonitor" element={<AdminIpMonitor />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="tickets" element={<AdminTickets />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="email-templates" element={<AdminEmailTemplates />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}