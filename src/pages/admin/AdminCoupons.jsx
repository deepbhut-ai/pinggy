import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

// Admin: Coupons — promo codes.
// APIs: GET /settings/coupons, POST /settings/coupons,
//       PUT /settings/coupons/{id}, DELETE /settings/coupons/{id}

export default function AdminCoupons() {
  const toast = useToast();
  const [coupons, setCoupons] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ code: '', percent_off: 10, max_redemptions: 0, expires_at: '' });

  const load = useCallback(async () => {
    try {
      setCoupons(await api('/settings/coupons'));
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      const body = { percent_off: Number(form.percent_off) };
      if (form.code.trim()) body.code = form.code.trim().toUpperCase();
      if (Number(form.max_redemptions) > 0) body.max_redemptions = Number(form.max_redemptions);
      if (form.expires_at) body.expires_at = form.expires_at;
      await api('/settings/coupons', 'POST', body);
      toast(`Coupon created${form.code.trim() ? ': ' + form.code.trim().toUpperCase() : ''}`);
      setForm({ code: '', percent_off: 10, max_redemptions: 0, expires_at: '' });
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const toggle = async (c) => {
    try {
      await api(`/settings/coupons/${c.id}`, 'PUT', { active: !c.active });
      toast(`Coupon ${c.active ? 'disabled' : 'enabled'}`);
      load(); setConfirm(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  const del = async (c) => {
    try {
      await api(`/settings/coupons/${c.id}`, 'DELETE');
      toast(`Coupon ${c.code} deleted`);
      load(); setConfirm(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-title">Coupons</div>
      <div className="page-subtitle">Promo codes — percent off at checkout</div>

      <div className="card">
        <div className="card-header"><h2>➕ Create Coupon</h2></div>
        <div className="card-body">
          <div className="cfg-row">
            <div className="form-group" style={{ maxWidth: 180 }}>
              <label>Code (blank = auto)</label>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SAVE20" />
            </div>
            <div className="form-group" style={{ maxWidth: 130 }}>
              <label>Percent off</label>
              <input type="number" min="1" max="100" value={form.percent_off} onChange={(e) => setForm({ ...form, percent_off: e.target.value })} />
            </div>
            <div className="form-group" style={{ maxWidth: 150 }}>
              <label>Max uses (0 = ∞)</label>
              <input type="number" min="0" value={form.max_redemptions} onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })} />
            </div>
            <div className="form-group" style={{ maxWidth: 170 }}>
              <label>Expires</label>
              <input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-sm" onClick={create}>Create</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Coupons ({coupons.length})</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Max uses</th><th>Redeemed</th><th>Status</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td className="code">{c.code}</td>
                  <td>{c.percent_off}%</td>
                  <td>{c.max_redemptions || '∞'}</td>
                  <td>{c.redeemed}</td>
                  <td><span className={`badge ${c.active ? 'badge-green' : ''}`}>{c.active ? 'Active' : 'Inactive'}</span></td>
                  <td className="dim">{c.expires_at ? String(c.expires_at).substring(0, 10) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title={c.active ? 'Disable' : 'Enable'} onClick={() => setConfirm({ title: `${c.active ? 'Disable' : 'Enable'} coupon ${c.code}?`, action: () => toggle(c) })}>
                      {c.active ? '⏸️' : '▶️'}
                    </button>{' '}
                    <button className="icon-btn" title="Delete" onClick={() => setConfirm({ title: `Delete coupon ${c.code}?`, action: () => del(c) })}>🗑️</button>
                  </td>
                </tr>
              ))}
              {!coupons.length && <tr><td colSpan="7" className="empty">No coupons yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {confirm && (
        <Modal title={confirm.title} confirmLabel="Confirm" onClose={() => setConfirm(null)}
          onConfirm={async () => { await confirm.action(); setConfirm(null); }}>
          <p className="dim">Are you sure?</p>
        </Modal>
      )}
    </>
  );
}