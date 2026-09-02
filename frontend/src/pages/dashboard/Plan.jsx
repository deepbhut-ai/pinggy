import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { formatBytes } from '../../utils';

// Plan page — current plan with facilities + all available plans side by side.
// Shows ALL plans (including the current one) so users can compare.
export default function Plan() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [me, setMe] = useState(null);
  const [pay, setPay] = useState(null);
  const [myTunnels, setMyTunnels] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [payMethod, setPayMethod] = useState('stripe');
  const [seats, setSeats] = useState(1);
  const [cycle, setCycle] = useState('monthly');

  const load = useCallback(async () => {
    try {
      const [plansD, meD, payD, tunnelsD] = await Promise.all([
        api('/plans'),
        api('/auth/me').catch(() => ({})),
        api('/payments/my').catch(() => ({})),
        api('/tunnels/my').catch(() => []),
      ]);
      setPlans(plansD);
      setMe(meD);
      setPay(payD);
      setMyTunnels(tunnelsD);
      if (meD?.seats) setSeats(meD.seats);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const currentPlanName = (me?.plan || 'free').toLowerCase();
  const enabled = pay?.enabled || {};

  let daysLeft = null;
  let renewalDate = null;
  if (me?.plan_expires_at) {
    const end = new Date(me.plan_expires_at);
    renewalDate = me.plan_expires_at.substring(0, 10);
    daysLeft = Math.max(0, Math.ceil((end - new Date()) / 86400000));
  }

  const totalRequests = myTunnels.reduce((s, t) => s + (t.request_count || 0), 0);
  const totalBytes = myTunnels.reduce((s, t) => s + (t.bytes_transferred || 0), 0);

  const openCheckout = (plan) => {
    if (plan.id.toLowerCase() === currentPlanName) {
      toast('You are already on this plan');
      return;
    }
    if (plan.price_inr === 0 && plan.price_usd === 0) {
      toast('Free plan is active by default');
      return;
    }
    setCheckoutPlan(plan);
    setCheckoutOpen(true);
  };

  const startCheckout = async () => {
    try {
      toast('Creating payment...');
      const resp = await api('/payments/checkout', 'POST', JSON.stringify({
        method: payMethod,
        plan: (checkoutPlan?.id || 'pro').toLowerCase(),
        seats: seats || 1,
        cycle: cycle || 'monthly',
      }));
      if (resp.url) window.location.href = resp.url;
      else toast('No payment URL returned', 'error');
    } catch (e) { toast(e.message, 'error'); }
  };

  const inrTotal = cycle === 'yearly'
    ? Math.round((checkoutPlan?.price_inr || 199) * 10) * seats
    : (checkoutPlan?.price_inr || 199) * seats;
  const usdTotal = cycle === 'yearly'
    ? Math.round((checkoutPlan?.price_usd || 2.99) * 10) * seats
    : (checkoutPlan?.price_usd || 2.99) * seats;
  const baseInr = checkoutPlan?.price_inr || 199;
  const baseUsd = checkoutPlan?.price_usd || 2.99;

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Plan</div>
          <div className="page-subtitle">Your current subscription, facilities, and available plans</div>
        </div>
        <div className="page-toolbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => { load(); refreshUser(); toast('Refreshed'); }}>🔄 Refresh</button>
        </div>
      </div>

      {/* ---- Current plan summary banner ---- */}
      <div className={`banner ${currentPlanName === 'pro' ? 'banner-green' : 'banner-amber'}`} style={{ marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '1.5rem' }}>{currentPlanName === 'pro' ? '⭐' : '🆓'}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong style={{ fontSize: '1rem' }}>
            You are on {currentPlanName === 'pro' ? 'Pro' : 'Free'}
            <span className="badge badge-green" style={{ marginLeft: '.5rem' }}>ACTIVE</span>
          </strong>
          <div className="dim" style={{ fontSize: '.825rem', marginTop: '.15rem' }}>
            {currentPlanName === 'pro'
              ? <>Persistent tunnels · fixed subdomains · custom domain{renewalDate ? ' · renews ' + renewalDate : ''}{daysLeft !== null ? <> · <strong style={{ color: 'var(--green)' }}>{daysLeft} days left</strong></> : ''}</>
              : <>1 tunnel · 60-minute timeout · random subdomain · 10 GB transfer cap</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="dim" style={{ fontSize: '.8rem' }}>{me?.seats || 1} seat{(me?.seats || 1) > 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* ---- Usage stats ---- */}
      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card"><div className="label">Active Tunnels</div><div className="value">{myTunnels.length}</div></div>
        <div className="stat-card"><div className="label">Total Requests</div><div className="value">{totalRequests}</div></div>
        <div className="stat-card"><div className="label">Data Transferred</div><div className="value">{formatBytes(totalBytes)}</div></div>
        <div className="stat-card"><div className="label">Seats</div><div className="value">{me?.seats || 1}</div></div>
      </div>

      {/* ---- All plans (including current) side by side ---- */}
      <div style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 .75rem' }}>📋 All Plans</div>
      <p className="dim" style={{ fontSize: '.85rem', marginBottom: '1.25rem' }}>
        Compare all plans and their facilities. Upgrade anytime — takes effect immediately after payment.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'stretch', marginBottom: '1.5rem' }}>
        {plans.map((p) => {
          const isCurrent = p.id.toLowerCase() === currentPlanName || p.name.toLowerCase() === currentPlanName;
          const isFreePlan = p.price_inr === 0 && p.price_usd === 0;
          return (
            <div
              key={p.id}
              className="card plan-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                border: isCurrent ? '2px solid var(--green)' : p.popular ? '2px solid var(--brand)' : '1px solid var(--border)',
                position: 'relative',
                overflow: 'visible',
                marginTop: p.popular || isCurrent ? '1rem' : 0,
              }}
            >
              {/* Badge */}
              {isCurrent ? (
                <div className="popular-badge" style={{ background: 'var(--green)' }}>YOUR PLAN</div>
              ) : p.popular ? (
                <div className="popular-badge">MOST POPULAR</div>
              ) : null}

              {/* Header */}
              <div className="card-body" style={{ textAlign: 'center', paddingBottom: '.5rem' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                  {isFreePlan ? '🆓' : '⭐'} {p.name}
                </div>
                <div className="dim" style={{ fontSize: '.82rem', marginTop: '.3rem' }}>{p.tagline}</div>
                <div style={{ fontSize: '1.9rem', fontWeight: 900, marginTop: '.6rem', color: p.popular ? 'var(--brand)' : undefined }}>
                  {isFreePlan ? '₹0' : `₹${p.price_inr}`}
                  <span className="dim" style={{ fontSize: '.8rem', fontWeight: 500 }}>/mo</span>
                </div>
                {!isFreePlan && <div className="dim" style={{ fontSize: '.75rem' }}>≈ ${p.price_usd} USD</div>}
              </div>

              {/* Facilities */}
              <div style={{ padding: '0 1.25rem .5rem', flex: 1 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
                  ✅ Facilities
                </div>
                <ul className="plan-facilities compact">
                  {p.features.map((f) => (
                    <li key={f}>
                      <span style={{ color: 'var(--green)' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Usage (only on current plan) */}
              {isCurrent && (
                <div style={{ padding: '.75rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.4rem' }}>
                    📊 Your usage
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '.82rem' }}>
                    <span>Tunnels: <strong>{myTunnels.length}</strong></span>
                    <span>Requests: <strong>{totalRequests}</strong></span>
                    <span>Data: <strong>{formatBytes(totalBytes)}</strong></span>
                  </div>
                </div>
              )}

              {/* CTA */}
              <div style={{ padding: '1rem' }}>
                {isCurrent ? (
                  <button className="btn btn-ghost" style={{ width: '100%' }} disabled>
                    Current Plan ✓
                  </button>
                ) : isFreePlan ? (
                  <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => toast('Free plan is the default — no action needed')}>
                    Default Plan
                  </button>
                ) : (
                  <button
                    className={`btn ${p.popular ? '' : 'btn-ghost'}`}
                    style={{ width: '100%' }}
                    onClick={() => openCheckout(p)}
                  >
                    {p.cta_label || 'Upgrade'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- Plan notes ---- */}
      <div className="card">
        <div className="card-header"><h2>ℹ️ Plan details</h2></div>
        <div className="card-body" style={{ fontSize: '.85rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
          • <strong style={{ color: 'var(--text)' }}>Free</strong>: 1 tunnel at a time · 10 GB transfer cap · 60-minute timeout · random subdomain each connect · 1 custom domain only.<br />
          • <strong style={{ color: 'var(--text)' }}>Pro</strong>: unlimited tunnel duration · multiple tunnels (scales with seats) · unlimited subdomains on your custom domain · priority support.<br />
          • Upgrades are processed via Stripe / PayPal / Crypto — you'll be redirected to complete payment securely.<br />
          • Need a custom downgrade or Enterprise quote? Open a ticket under <strong style={{ color: 'var(--text)' }}>Support</strong> — our team will process it.<br />
          • Manage payment history and invoices under <a href="/dashboard/subscription" style={{ color: 'var(--brand)', fontWeight: 600 }}>Billing & Invoices</a>.
        </div>
      </div>

      {/* ---- Checkout modal ---- */}
      {checkoutOpen && checkoutPlan && (
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
                <span style={{ fontWeight: 700 }}>{checkoutPlan.name} Plan</span>
                <span className="badge badge-blue">{cycle === 'yearly' ? 'Yearly' : 'Monthly'}</span>
              </div>
              <div className="order-row">
                <span>Seats</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
                  <button className="icon-btn" style={{ width: 24, height: 24, fontSize: '.85rem', padding: 0 }} onClick={() => setSeats(Math.max(1, seats - 1))}>−</button>
                  <strong>{seats}</strong>
                  <button className="icon-btn" style={{ width: 24, height: 24, fontSize: '.85rem', padding: 0 }} onClick={() => setSeats(Math.min(10, seats + 1))}>+</button>
                </span>
              </div>
              <div className="order-row">
                <span>Billing cycle</span>
                <span style={{ display: 'inline-flex', gap: '.25rem' }}>
                  <button className={`btn btn-sm ${cycle === 'monthly' ? '' : 'btn-ghost'}`} style={{ padding: '.15rem .5rem', fontSize: '.75rem' }} onClick={() => setCycle('monthly')}>Monthly</button>
                  <button className={`btn btn-sm ${cycle === 'yearly' ? '' : 'btn-ghost'}`} style={{ padding: '.15rem .5rem', fontSize: '.75rem' }} onClick={() => setCycle('yearly')}>Yearly (save 17%)</button>
                </span>
              </div>
              {cycle === 'yearly' && (
                <div className="order-row" style={{ color: 'var(--green)' }}>
                  <span>Savings</span><span>₹{baseInr * seats * 2}</span>
                </div>
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
    </>
  );
}