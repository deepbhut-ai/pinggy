import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { formatBytes } from '../../utils';

// My Usage — 5 stat cards + 3 bar charts (like legacy)
export default function MyUsage() {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    api('/analytics/my?days=30').then(setUsage).catch(() => {});
  }, []);

  if (!usage) return <p className="empty">Loading…</p>;

  const s = usage.summary;
  const days = usage.daily || [];

  const BarChart = ({ title, points, color }) => {
    const max = Math.max(1, ...points.map((p) => p.value));
    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>{title}</h2></div>
        <div className="card-body">
          <div className="bar-chart">
            {points.map((p, i) => (
              <div key={i} className="bar-cell" title={p.tip}>
                <div className="bar-fill" style={{ height: Math.max(2, Math.round((p.value / max) * 90)), background: color }}></div>
                <div className="bar-label">{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const mk = (key) => days.map((x) => ({
    label: x.day.slice(5),
    value: x[key],
    tip: `${x.day} — ${key === 'bytes' ? formatBytes(x.bytes) : `${x[key]} ${key}`}`,
  }));

  return (
    <>
      <div className="page-title">My Usage</div>
      <div className="page-subtitle">Your tunnel activity over the last 30 days</div>

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card"><div className="label">Total Tunnels</div><div className="value">{s.total_tunnels}</div></div>
        <div className="stat-card"><div className="label">Total Requests</div><div className="value">{s.total_requests}</div></div>
        <div className="stat-card"><div className="label">Data Transferred</div><div className="value">{formatBytes(s.total_bytes)}</div></div>
        <div className="stat-card"><div className="label">Tunnels Today</div><div className="value">{s.tunnels_today}</div></div>
        <div className="stat-card"><div className="label">Requests This Month</div><div className="value">{s.requests_this_month}</div></div>
      </div>

      <BarChart title="Requests / day" points={mk('requests')} color="var(--brand)" />
      <BarChart title="Tunnels created / day" points={mk('tunnels')} color="#22c55e" />
      <BarChart
        title="Data / day"
        points={days.map((x) => ({ label: x.day.slice(5), value: Math.round(x.bytes / 1024), tip: `${x.day} — ${formatBytes(x.bytes)}` }))}
        color="#f59e0b"
      />

      <div className="card">
        <div className="card-body" style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>
          Unlimited data on every plan — these charts are informational, not a quota.
        </div>
      </div>
    </>
  );
}