import { useEffect, useState, useCallback } from 'react';
import { api, getToken } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { formatBytes } from '../../utils';

// Billing & Invoices — payments, subscriptions, and invoice history.
// (Plan comparison lives on the Plan page — this page is billing only.)
export default function Billing() {
  const toast = useToast();
  const [me, setMe] = useState(null);
  const [pay, setPay] = useState(null);
  const [myTunnels, setMyTunnels] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payMethod, setPayMethod] = useState('stripe');
  const [seats, setSeats] = useState(1);
  const [cycle, setCycle] = useState('monthly');
  const [downgradeOpen, setDowngradeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [meD, payD, tunnelsD, invD] = await Promise.all([
        api('/auth/me').catch(() => ({})),
        api('/payments/my').catch(() => ({})),
        api('/tunnels/my').catch(() => []),
        api('/invoices/my').catch(() => []),
      ]);
      setMe(meD);
      setPay(payD);
      setMyTunnels(tunnelsD);
      setInvoices(invD);
      if (meD?.seats) setSeats(meD.seats);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const isPro = (me?.plan || pay?.plan || 'free') === 'pro';
  const enabled = pay?.enabled || {};
  const priceInr = pay?.price_inr || 199;
  const priceUsd = pay?.price_usd || 2.99;
  const yearlyInr = Math.round(priceInr * 10);

  const totalRequests = myTunnels.reduce((s, t) => s + (t.request_count || 0), 0);
  const totalBytes = myTunnels.reduce((s, t) => s + (t.bytes_transferred || 0), 0);

  let daysLeft = null;
  let renewalDate = null;
  if (isPro && me?.plan_expires_at) {
    const end = new Date(me.plan_expires_at);
    renewalDate = me.plan_expires_at.substring(0, 10);
    daysLeft = Math.max(0, Math.ceil((end - new Date()) / 86400000));
  }

  const inrTotal = cycle === 'yearly' ? priceInr * seats * 10 : priceInr * seats;
  const usdTotal = cycle === 'yearly' ? priceUsd * seats * 10 : priceUsd * seats;

  const startCheckout = async () => {
    try {
      toast('Creating payment...');
      const resp = await api('/payments/checkout', 'POST', JSON.stringify({
        method: payMethod, plan: 'pro', seats: seats || 1, cycle: cycle || 'monthly',
      }));
      if (resp.url) window.location.href = resp.url;
      else toast('No payment URL returned', 'error');
    } catch (e) { toast(e.message, 'error'); }
  };

  const activeRows = isPro
    ? (pay?.history || []).filter((p) => p.status === 'paid').map((p, i) => {
        const start = p.created_at ? p.created_at.substring(0, 10) : '—';
        const endDt = new Date(p.created_at);
        endDt.setMonth(endDt.getMonth() + 1);
        return (
          <tr key={i}>
            <td>Tunnel Pro</td><td>1</td><td>{start}</td><td>{endDt.toISOString().substring(0, 10)}</td>
          </tr>
        );
      })
    : [];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div className="page-title">Billing & Invoices</div>
          <div className="page-subtitle" style={{ marginBottom: 0 }}>Payments, subscriptions, and invoice history</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Refresh</button>
          {!isPro && (
            <a className="btn btn-sm" href="/dashboard/plan">View Plans →</a>
          )}
        </div>
      </div>

      {/* Plan banner (status only — details on Plan page) */}
      {isPro ? (
        <div className="banner banner-green" style={{ marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '1.5rem' }}>⭐</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong style={{ fontSize: '1rem' }}>You are on Pro</strong>
            <div className="dim" style={{ fontSize: '.825rem' }}>
              Persistent tunnels, fixed subdomains, custom domain
              {renewalDate ? ' · renews ' + renewalDate : ''}
              {daysLeft !== null ? <> · <strong style={{ color: 'var(--green)' }}>{daysLeft} days left</strong></> : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setCheckoutOpen(true)}>➕ Extend / Add Seats</button>
            <a className="btn btn-ghost btn-sm" href="/dashboard/plan">Plan details →</a>
          </div>
        </div>
      ) : (
        <div className="banner banner-amber" style={{ marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🆓</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong style={{ fontSize: '.95rem' }}>You are on Free</strong>
            <div className="dim" style={{ fontSize: '.825rem' }}>1 tunnel · 60-minute timeout · unlimited subdomains</div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <a className="btn btn-sm" href="/dashboard/plan">Upgrade Plan →</a>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card"><div className="label">Active Tunnels</div><div className="value">{myTunnels.length}</div></div>
        <div className="stat-card"><div className="label">Total Requests</div><div className="value">{totalRequests}</div></div>
        <div className="stat-card"><div className="label">Data Transfer</div><div className="value">{formatBytes(totalBytes)}</div></div>
        <div className="stat-card">
          <div className="label">Plan</div>
          <div className="value" style={{ color: isPro ? 'var(--green)' : undefined, fontSize: '1.25rem' }}>
            {isPro ? `Pro${daysLeft !== null ? ' · ' + daysLeft + 'd' : ''}` : 'Free'}
          </div>
        </div>
      </div>

      {/* Bandwidth */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header">
          <h2>Bandwidth Usage</h2>
          <span className="dim" style={{ fontSize: '.8rem' }}>{formatBytes(totalBytes)} transferred · unlimited on every plan</span>
        </div>
        <div className="card-body">
          <div style={{ background: 'var(--bg)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (totalBytes / 1073741824) * 100).toFixed(1)}%`, height: '100%', background: 'linear-gradient(90deg,var(--brand),#22c55e)' }}></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--text-dim)', marginTop: '.3rem' }}>
            <span>{formatBytes(totalBytes)} used</span><span>No caps, no throttling — unlimited on every IRAGT plan 🚀</span>
          </div>
        </div>
      </div>

      {/* Active subscriptions */}
      <div className="card">
        <div className="card-header"><h2 style={{ color: 'var(--green)' }}>Your Active Subscriptions</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Plan</th><th>Number of seats</th><th>Start Date</th><th>End / Renewal Date</th></tr></thead>
            <tbody>
              {activeRows.length ? activeRows : (
                isPro && renewalDate ? (
                  <tr>
                    <td>Tunnel Pro</td><td>{me?.seats || 1}</td>
                    <td>{new Date(new Date(me.plan_expires_at).setDate(new Date(me.plan_expires_at).getDate() - 30)).toISOString().substring(0, 10)}</td>
                    <td>{renewalDate}</td>
                  </tr>
                ) : (
                  <tr><td colSpan="4" className="empty">No active subscriptions</td></tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment history */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2>Payment History</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {(pay?.history || []).length === 0 ? (
            <p className="empty">No payments yet</p>
          ) : (
            <table>
              <thead><tr><th>Date</th><th>Method</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {(pay.history || []).map((p, i) => {
                  const statusClass = p.status === 'paid' ? 'badge-green'
                    : (p.status === 'failed' || p.status === 'expired') ? 'badge-red' : 'badge-amber';
                  return (
                    <tr key={i}>
                      <td>{p.created_at ? p.created_at.substring(0, 10) : '—'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{p.method}</td>
                      <td style={{ textTransform: 'capitalize' }}>{p.plan}</td>
                      <td>{p.amount.toFixed(2)} {p.currency}</td>
                      <td><span className={`badge ${statusClass}`}>{p.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2>🧾 My Invoices</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {invoices.length === 0 ? (
            <p className="empty">No invoices yet — they appear here after a successful payment.</p>
          ) : (
            <table>
              <thead><tr><th>Invoice #</th><th>Plan</th><th>Coupon</th><th>Amount</th><th>Status</th><th>Issued</th><th>Actions</th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="code">{i.invoice_no}</td>
                    <td>{i.plan}</td>
                    <td>{i.coupon_code || '—'}</td>
                    <td>{i.currency === 'INR' ? '₹' : '$'}{i.amount}</td>
                    <td><span className={`badge ${i.status === 'paid' ? 'badge-green' : 'badge-red'}`}>{i.status}</span></td>
                    <td>{i.issued_at ? i.issued_at.substring(0, 10) : '—'}</td>
                    <td>
                      <a href={`/api/v1/invoices/${i.id}/print?token=${encodeURIComponent(getToken())}`} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>🖨️ Invoice</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Checkout modal — seats + cycle live here now */}
      {checkoutOpen && (
        <Modal
          title="Checkout"
          confirmLabel={`Pay Now → ₹${inrTotal}`}
          onConfirm={() => { setCheckoutOpen(false); startCheckout(); }}
          onClose={() => setCheckoutOpen(false)}
        >
          <div style={{ marginBottom: '1rem' }}>
            <div className="dim" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: '.5rem' }}>Order Summary</div>
            <div className="order-summary">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                <span style={{ fontWeight: 700 }}>Tunnel Pro</span>
                <span className="badge badge-blue">{cycle === 'yearly' ? 'Yearly' : 'Monthly'}</span>
              </div>
              <div className="order-row">
                <span>Seats</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
                  <button
                    className="icon-btn"
                    style={{ width: 24, height: 24, fontSize: '.85rem', padding: 0 }}
                    onClick={() => setSeats(Math.max(1, seats - 1))}
                  >−</button>
                  <strong>{seats}</strong>
                  <button
                    className="icon-btn"
                    style={{ width: 24, height: 24, fontSize: '.85rem', padding: 0 }}
                    onClick={() => setSeats(Math.min(10, seats + 1))}
                  >+</button>
                </span>
              </div>
              <div className="order-row">
                <span>Billing cycle</span>
                <span style={{ display: 'inline-flex', gap: '.25rem' }}>
                  <button
                    className={`btn btn-sm ${cycle === 'monthly' ? '' : 'btn-ghost'}`}
                    style={{ padding: '.15rem .5rem', fontSize: '.75rem' }}
                    onClick={() => setCycle('monthly')}
                  >Monthly</button>
                  <button
                    className={`btn btn-sm ${cycle === 'yearly' ? '' : 'btn-ghost'}`}
                    style={{ padding: '.15rem .5rem', fontSize: '.75rem' }}
                    onClick={() => setCycle('yearly')}
                  >Yearly (save 17%)</button>
                </span>
              </div>
              {cycle === 'yearly' && (
                <div className="order-row" style={{ color: 'var(--green)' }}><span>Savings</span><span>₹{priceInr * seats * 2}</span></div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '.5rem', paddingTop: '.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>Total</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--brand)' }}>₹{inrTotal}</div>
                  <div className="dim" style={{ fontSize: '.75rem' }}>≈ ${usdTotal.toFixed(2)} USD</div>
                </div>
              </div>
            </div>
          </div>

          <div className="dim" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: '.5rem' }}>Choose Payment Method</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '1rem' }}>
            {[
              ['stripe', '💳', 'Stripe', 'Card · UPI · NetBanking · INR'],
              ['paypal', '🅿️', 'PayPal', `Wallet · $${usdTotal.toFixed(2)} USD`],
              ['nowpayments', '🪙', 'Crypto', 'BTC · ETH · USDT · NowPayments'],
            ].map(([value, icon, name, desc]) => {
              const methodEnabled = enabled[value] !== false;
              return (
                <label key={value} className={`pay-opt ${payMethod === value ? 'selected' : ''} ${methodEnabled ? '' : 'disabled'}`}>
                  <input type="radio" checked={payMethod === value} disabled={!methodEnabled} onChange={() => setPayMethod(value)} />
                  <span style={{ fontSize: '1.3rem' }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <strong>{name}</strong>
                    <div className="dim" style={{ fontSize: '.75rem' }}>{methodEnabled ? desc : 'Not configured — contact support'}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="dim" style={{ fontSize: '.75rem', marginBottom: '.75rem', lineHeight: 1.5 }}>
            🔒 Payments are processed securely. You'll be redirected to the payment provider to complete your purchase.
          </div>
        </Modal>
      )}

      {/* Downgrade modal */}
      {downgradeOpen && (
        <Modal title="Downgrade to Free" confirmLabel="Request Downgrade" onConfirm={() => { setDowngradeOpen(false); toast('Downgrade requested — contact support or admin to process'); }} onClose={() => setDowngradeOpen(false)}>
          <p className="dim" style={{ fontSize: '.875rem', lineHeight: 1.6 }}>
            Are you sure you want to downgrade to <strong style={{ color: 'var(--text)' }}>Free</strong>?
          </p>
          <div style={{ margin: '.75rem 0', padding: '.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.825rem' }} className="dim">
            You will lose: persistent tunnels, fixed subdomains, custom domain.<br />
            Free limits: 1 tunnel · 60-minute timeout · unlimited subdomains.
          </div>
          <p className="dim" style={{ fontSize: '.78rem', marginTop: '.6rem' }}>Note: an admin will process your downgrade. Your Pro stays active until then.</p>
        </Modal>
      )}
    </>
  );
}