import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

// Admin: Plans — edit plan cards shown on the user Plan page.
// APIs: GET /plans?include_inactive=true, PUT /plans/{id} { name, prices, tagline, features, cta_label, active }

export default function AdminPlans() {
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [edit, setEdit] = useState(null); // { plan, form }

  const load = useCallback(async () => {
    try {
      setPlans(await api('/plans?include_inactive=true'));
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (p) => setEdit({
    plan: p,
    form: {
      name: p.name, price_inr: p.price_inr, price_usd: p.price_usd,
      tagline: p.tagline || '', features: (p.features || []).join('\n'),
      cta_label: p.cta_label || '',
    },
  });

  const save = async () => {
    const { plan, form } = edit;
    try {
      await api(`/plans/${plan.id}`, 'PUT', {
        name: form.name,
        price_inr: Number(form.price_inr),
        price_usd: Number(form.price_usd),
        tagline: form.tagline,
        features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
        cta_label: form.cta_label,
      });
      toast(`Plan ${form.name} saved`);
      setEdit(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const toggle = async (p) => {
    try {
      await api(`/plans/${p.id}`, 'PUT', { active: !p.active });
      toast(`${p.name} ${p.active ? 'hidden' : 'shown'}`);
      load(); setConfirm(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-title">Plans</div>
      <div className="page-subtitle">What users see on the Plan page</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {plans.map((p) => (
          <div className="card" key={p.id} style={{ display: 'flex', flexDirection: 'column', border: p.popular ? '2px solid var(--brand)' : undefined }}>
            <div className="card-body" style={{ textAlign: 'center', paddingBottom: '.5rem' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{p.id === 'free' ? '🆓' : '⭐'} {p.name}</div>
              <span className="badge">{p.id}</span>{' '}
              {!p.active && <span className="badge">hidden</span>}
              <div style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: '.5rem' }}>₹{p.price_inr}<span className="dim" style={{ fontSize: '.8rem' }}>/mo</span></div>
              <div className="dim" style={{ fontSize: '.75rem' }}>≈ ${p.price_usd} USD</div>
              <div className="dim" style={{ fontSize: '.8rem', marginTop: '.4rem' }}>{p.tagline}</div>
            </div>
            <div style={{ padding: '0 1.25rem .5rem', flex: 1 }}>
              <ul className="plan-facilities compact" style={{ fontSize: '.8rem' }}>
                {(p.features || []).map((f) => <li key={f}><span style={{ color: 'var(--green)' }}>✓</span> {f}</li>)}
              </ul>
            </div>
            <div style={{ padding: '1rem', display: 'flex', gap: '.5rem' }}>
              <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => openEdit(p)}>✏️ Edit</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setConfirm({ title: `${p.active ? 'Hide' : 'Show'} plan ${p.name}?`, action: () => toggle(p) })}>
                {p.active ? '🙈 Hide' : '👁️ Show'}
              </button>
            </div>
          </div>
        ))}
        {!plans.length && <p className="empty">No plans.</p>}
      </div>

      {edit && (
        <Modal title={`Edit ${edit.plan.name}`} confirmLabel="Save" onConfirm={save} onClose={() => setEdit(null)}>
          <div className="cfg-row">
            <div className="form-group cfg-field"><label>Name</label>
              <input type="text" value={edit.form.name} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, name: e.target.value } })} /></div>
            <div className="form-group" style={{ maxWidth: 120 }}><label>Price ₹/mo</label>
              <input type="number" value={edit.form.price_inr} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, price_inr: e.target.value } })} /></div>
            <div className="form-group" style={{ maxWidth: 120 }}><label>Price $/mo</label>
              <input type="number" step="0.01" value={edit.form.price_usd} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, price_usd: e.target.value } })} /></div>
          </div>
          <div className="form-group"><label>Tagline</label>
            <input type="text" value={edit.form.tagline} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, tagline: e.target.value } })} /></div>
          <div className="form-group"><label>Features (one per line)</label>
            <textarea rows="6" value={edit.form.features} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, features: e.target.value } })} /></div>
          <div className="form-group"><label>CTA label</label>
            <input type="text" value={edit.form.cta_label} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, cta_label: e.target.value } })} /></div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} confirmLabel="Confirm" onClose={() => setConfirm(null)}
          onConfirm={async () => { await confirm.action(); setConfirm(null); }}>
          <p className="dim">Are you sure?</p>
        </Modal>
      )}
    </>
  );
}