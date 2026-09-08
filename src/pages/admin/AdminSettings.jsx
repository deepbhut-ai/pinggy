import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';

// Admin: Settings — runtime app settings (payments, SMTP, general).
// APIs: GET /settings, PUT /settings { values: {...} }

const GROUPS = [
  { prefix: 'stripe_', title: '💳 Stripe' },
  { prefix: 'paypal_', title: '🅿️ PayPal' },
  { prefix: 'nowpayments_', title: '🪙 Crypto (NowPayments)' },
  { prefix: 'smtp_', title: '📧 SMTP (email)' },
];

export default function AdminSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState([]);
  const [values, setValues] = useState({}); // key -> new value from inputs
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api('/settings');
      setSettings(s);
      setValues({});
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const out = GROUPS.map((g) => ({ ...g, items: [] }));
    const other = { title: '⚙️ General', items: [] };
    settings.forEach((s) => {
      const g = out.find((g) => s.key.startsWith(g.prefix));
      (g || other).items.push(s);
    });
    return [...out, other].filter((g) => g.items.length);
  }, [settings]);

  const save = async () => {
    // only send non-empty inputs (empty secret = keep stored)
    const payload = {};
    Object.entries(values).forEach(([k, v]) => { if (v !== '' && v !== undefined) payload[k] = v; });
    if (!Object.keys(payload).length) { toast('Nothing to save'); return; }
    setBusy(true);
    try {
      await api('/settings', 'PUT', { values: payload });
      toast('Settings saved');
      load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const dirty = Object.values(values).some((v) => v !== '' && v !== undefined);

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Runtime configuration — DB overrides beat env defaults</div>
        </div>
        <button className="btn btn-sm" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : '💾 Save All'}</button>
      </div>

      {grouped.map((g) => (
        <div className="card" key={g.title}>
          <div className="card-header"><h2>{g.title}</h2></div>
          <div className="card-body">
            {g.items.map((s) => (
              <div className="form-group" key={s.key}>
                <label>
                  {s.label} <span className="dim" style={{ fontSize: '.7rem' }}>({s.key})</span>{' '}
                  <span className={`badge ${s.source === 'db' ? 'badge-blue' : ''}`}>{s.source === 'db' ? 'DB override' : 'env default'}{!s.is_set ? ' · not set' : ''}</span>
                </label>
                <input
                  type="text"
                  placeholder={s.is_secret && s.is_set ? '(set — send new value to replace)' : (s.value || '')}
                  defaultValue={s.is_secret ? '' : (s.value || '')}
                  disabled={s.is_secret && !s.is_set === undefined}
                  onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                />
              </div>
            ))}
            {!g.items.length && <p className="empty">No settings in this group.</p>}
          </div>
        </div>
      ))}

      <div className="card">
        <div className="card-body dim" style={{ fontSize: '.8rem' }}>
          Secrets stay hidden — send a new value to replace them, leave blank to keep.
          Non-secret values show their current value for editing.
        </div>
      </div>
    </>
  );
}