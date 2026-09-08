import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { SearchBar, Pagination } from '../../components/TableControls';
import { getToken } from '../../api/client';

// Admin: Invoices — list, view, void, print.
// APIs: GET /invoices/admin/all, GET /invoices/{id}, POST /invoices/{id}/void,
//       GET /invoices/{id}/print?token=JWT (opened in new tab)

export default function AdminInvoices() {
  const toast = useToast();
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);   // invoice detail object
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setInvoices(await api('/invoices/admin/all'));
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q ? invoices.filter((v) =>
    (v.user_email || '').toLowerCase().includes(q) || (v.invoice_no || '').toLowerCase().includes(q)
  ) : invoices;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const paidCount = invoices.filter((v) => v.status === 'paid').length;
  const revenue = invoices.filter((v) => v.status === 'paid').reduce((s, v) => s + (v.currency === 'INR' ? v.amount : 0), 0);

  const openView = async (id) => {
    try { setView(await api(`/invoices/${id}`)); }
    catch (e) { toast(e.message, 'error'); }
  };

  const printInvoice = (inv) => {
    window.open(`/api/v1/invoices/${inv.id}/print?token=${encodeURIComponent(getToken())}`, '_blank');
    setView(null);
  };

  const voidInvoice = async (inv) => {
    try {
      await api(`/invoices/${inv.id}/void`, 'POST');
      toast(`Invoice ${inv.invoice_no} voided`);
      setView(null); setConfirm(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Invoices ({invoices.length})</div>
          <div className="page-subtitle">Billing history across all users</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search invoice, user…" />
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Invoices</div><div className="value">{invoices.length}</div></div>
        <div className="stat-card"><div className="label">Paid</div><div className="value">{paidCount}</div></div>
        <div className="stat-card"><div className="label">Invoiced Revenue (₹)</div><div className="value">{revenue.toLocaleString()}</div></div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Invoice #</th><th>User</th><th>Plan</th><th>Seats</th><th>Coupon</th><th>Amount</th><th>Status</th><th>Issued</th><th></th></tr></thead>
            <tbody>
              {paged.map((v) => (
                <tr key={v.id}>
                  <td className="code">{v.invoice_no}</td>
                  <td>{v.user_email}</td>
                  <td><span className="badge">{v.plan}</span></td>
                  <td>{v.seats}</td>
                  <td>{v.coupon_code || '—'}</td>
                  <td>{v.currency} {v.amount}</td>
                  <td><span className={`badge ${v.status === 'paid' ? 'badge-green' : ''}`}>{v.status}</span></td>
                  <td className="dim">{String(v.issued_at || '').substring(0, 10)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title="View" onClick={() => openView(v.id)}>👁️</button>{' '}
                    {v.status === 'paid' && (
                      <button className="icon-btn" title="Void" onClick={() => setConfirm({ title: `Void invoice ${v.invoice_no}?`, action: () => voidInvoice(v) })}>🗑️</button>
                    )}
                  </td>
                </tr>
              ))}
              {!paged.length && <tr><td colSpan="9" className="empty">No invoices.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card-body" style={{ paddingTop: '.5rem' }}>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} total={filtered.length} pageSize={pageSize} />
        </div>
      </div>

      {view && (
        <Modal title={`Invoice ${view.invoice_no}`} confirmLabel="🖨️ Print" onConfirm={() => printInvoice(view)} onClose={() => setView(null)}>
          <table>
            <tbody>
              <tr><td className="dim">Billed to</td><td>{view.user_email}</td></tr>
              <tr><td className="dim">Plan</td><td>{view.plan} ({view.seats} seat{view.seats > 1 ? 's' : ''})</td></tr>
              <tr><td className="dim">Coupon</td><td>{view.coupon_code || '—'}</td></tr>
              <tr><td className="dim">Amount</td><td><strong>{view.currency} {view.amount}</strong></td></tr>
              <tr><td className="dim">Status</td><td><span className={`badge ${view.status === 'paid' ? 'badge-green' : ''}`}>{view.status}</span></td></tr>
              <tr><td className="dim">Issued</td><td>{String(view.issued_at || '').substring(0, 10)}</td></tr>
            </tbody>
          </table>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} confirmLabel="Void" onClose={() => setConfirm(null)}
          onConfirm={async () => { await confirm.action(); setConfirm(null); }}>
          <p className="dim">Voiding marks this invoice canceled. Are you sure?</p>
        </Modal>
      )}
    </>
  );
}