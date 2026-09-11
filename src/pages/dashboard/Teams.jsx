import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

// Teams — full role control, seat sharing, token sharing, activity feed
export default function Teams() {
  const { user } = useAuth();
  const toast = useToast();
  const [teams, setTeams] = useState([]);
  const [myTokens, setMyTokens] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [delOpen, setDelOpen] = useState(null); // team
  const [activity, setActivity] = useState({}); // teamId -> entries|'loading'|null
  const [assigningSeat, setAssigningSeat] = useState({}); // teamId -> email

  const load = useCallback(async () => {
    try {
      const [t, tk] = await Promise.all([api('/teams'), api('/tokens').catch(() => [])]);
      setTeams(t);
      setMyTokens(tk);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const roleBadge = (r) => r === 'owner' || r === 'admin'
    ? <span className="badge badge-green">{r}</span>
    : <span className="badge">member</span>;
  const canManage = (t) => t.my_role === 'owner' || t.my_role === 'admin';

  const createTeam = async () => {
    if (!newTeamName.trim()) return toast('Enter a team name', 'error');
    try {
      await api('/teams', 'POST', JSON.stringify({ name: newTeamName.trim() }));
      toast(`Team "${newTeamName.trim()}" created`);
      setNewTeamName('');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const addMember = async (teamId, email, role) => {
    if (!email?.trim()) return toast('Enter an email', 'error');
    try {
      await api(`/teams/${teamId}/members`, 'POST', JSON.stringify({ email: email.trim(), role }));
      toast(`${email.trim()} added as ${role}`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const changeRole = async (teamId, email, role) => {
    try {
      await api(`/teams/${teamId}/members/${encodeURIComponent(email)}`, 'PATCH', JSON.stringify({ role }));
      toast(`${email} is now ${role}`);
    } catch (e) { toast(e.message, 'error'); load(); }
  };

  const removeMember = async (teamId, email) => {
    try {
      await api(`/teams/${teamId}/members/${encodeURIComponent(email)}`, 'DELETE');
      toast(`${email} removed`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const assignSeat = async (teamId, email) => {
    if (!email) return toast('Select a team member to assign a seat', 'error');
    try {
      const res = await api(`/teams/${teamId}/seats/assign`, 'POST', JSON.stringify({ email }));
      toast(res.message || `Pro seat assigned to ${email}`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const unassignSeat = async (teamId, email) => {
    try {
      const res = await api(`/teams/${teamId}/seats/unassign`, 'POST', JSON.stringify({ email }));
      toast(res.message || `Pro seat unassigned from ${email}`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const assignToken = async (teamId, tokenId) => {
    if (!tokenId) return toast('Pick a token to share', 'error');
    try {
      await api(`/tokens/${tokenId}/team`, 'PUT', JSON.stringify({ team_id: teamId }));
      toast('Token shared with the team');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const unassignToken = async (tokenId, teamName) => {
    try {
      await api(`/tokens/${tokenId}/team`, 'PUT', JSON.stringify({ team_id: null }));
      toast(`Token no longer shared with ${teamName}`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const deleteTeam = async () => {
    try {
      await api(`/teams/${delOpen.id}`, 'DELETE');
      toast('Team deleted');
      setDelOpen(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const loadActivity = async (teamId) => {
    setActivity((a) => ({ ...a, [teamId]: 'loading' }));
    try {
      const ev = await api(`/teams/${teamId}/activity`);
      setActivity((a) => ({ ...a, [teamId]: ev }));
    } catch (e) {
      setActivity((a) => ({ ...a, [teamId]: e.message }));
    }
  };

  return (
    <>
      <h2 style={{ marginBottom: '1rem' }}>Teams &amp; Collaboration</h2>
      <p className="dim" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>
        Invite teammates, share <strong>Pro Subscription Seats</strong> so members get full Pro features, and share <strong>Tunnels &amp; Tokens</strong> for unified collaboration.
      </p>

      <div className="card">
        <div className="card-header"><h2>Create a Team</h2></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="e.g. Platform Engineering" style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={createTeam}>Create Team</button>
          </div>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="card"><div className="card-body"><p className="empty">No teams yet — create your first team above.</p></div></div>
      ) : teams.map((t) => {
        const seatStats = t.seats || { total: 1, allocated: 0, available: 0, owner_plan: 'free' };
        const maxSharable = Math.max(0, seatStats.total - 1);
        const unassignedMembers = (t.members || []).filter((m) => m.email !== t.owner_email && !m.has_seat);

        return (
          <div className="card" key={t.id} style={{ marginTop: '1.25rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <h2 style={{ margin: 0 }}>👥 {t.name}</h2>
                {roleBadge(t.my_role)}
              </div>
              {t.i_own && (
                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)' }} onClick={() => setDelOpen(t)}>Delete team</button>
              )}
            </div>

            <div className="card-body">
              {/* ---- Seat Pool Summary Banner ---- */}
              <div style={{
                background: 'var(--card-bg, rgba(255,255,255,0.03))',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🎟️</span>
                  <div>
                    <div style={{ fontSize: '.85rem', fontWeight: 600 }}>
                      Pro Seats: <span style={{ color: 'var(--brand)' }}>{seatStats.allocated}</span> / {maxSharable} Assigned
                      <span className="dim" style={{ fontWeight: 400, marginLeft: '.5rem' }}>
                        ({seatStats.available} available to share)
                      </span>
                    </div>
                    <div className="dim" style={{ fontSize: '.75rem' }}>
                      Owner Plan: <strong>{seatStats.owner_plan?.toUpperCase()}</strong> · Primary seat reserved for owner
                    </div>
                  </div>
                </div>
                {t.i_own && (
                  <Link to="/dashboard/plan" className="btn btn-sm btn-ghost" style={{ fontSize: '.78rem', textDecoration: 'none' }}>
                    + Buy More Seats
                  </Link>
                )}
              </div>

              {/* ---- Members Table with Seat Status ---- */}
              <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: '.5rem' }}>
                👤 Team Members ({(t.members || []).length})
              </div>
              <table style={{ fontSize: '.85rem' }}>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Pro Seat</th>
                    <th style={{ width: 200, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(t.members || []).map((m) => {
                    const isOwnerRow = m.email === t.owner_email;
                    const canRemove = !isOwnerRow && (t.my_role === 'owner' || (canManage(t) && m.role === 'member') || m.email === user?.email);
                    return (
                      <tr key={m.email}>
                        <td>
                          {m.email}
                          {m.email === user?.email && <span className="dim" style={{ fontSize: '.75rem' }}> (you)</span>}
                        </td>
                        <td>
                          {t.my_role === 'owner' && !isOwnerRow ? (
                            <select
                              value={m.role}
                              onChange={(e) => changeRole(t.id, m.email, e.target.value)}
                              style={{ width: 'auto', padding: '.25rem .5rem', fontSize: '.8rem' }}
                            >
                              <option value="member">member</option>
                              <option value="admin">admin</option>
                            </select>
                          ) : roleBadge(isOwnerRow ? 'owner' : m.role)}
                        </td>
                        <td>
                          {isOwnerRow ? (
                            <span className="badge badge-green">👑 Owner Account</span>
                          ) : m.has_seat ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
                              <span className="badge badge-green">⭐ Pro Seat</span>
                              {m.seat_assigned_at && (
                                <span className="dim" style={{ fontSize: '.72rem' }}>
                                  ({new Date(m.seat_assigned_at).toLocaleDateString()})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="badge" style={{ opacity: 0.7 }}>Free</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '.35rem', justifyContent: 'flex-end' }}>
                            {canManage(t) && !isOwnerRow && (
                              m.has_seat ? (
                                <button
                                  className="btn btn-sm btn-ghost"
                                  style={{ fontSize: '.75rem', padding: '.2rem .5rem' }}
                                  title="Revoke Pro seat back to pool"
                                  onClick={() => unassignSeat(t.id, m.email)}
                                >
                                  Unassign Seat
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm btn-ghost"
                                  style={{ fontSize: '.75rem', padding: '.2rem .5rem', color: seatStats.available > 0 ? 'var(--brand)' : 'var(--text-dim)' }}
                                  title={seatStats.available > 0 ? "Assign 1 Pro seat to this member" : "No seats available in pool"}
                                  disabled={seatStats.available <= 0}
                                  onClick={() => assignSeat(t.id, m.email)}
                                >
                                  ⭐ Assign Seat
                                </button>
                              )
                            )}
                            {canRemove && (
                              <button className="btn btn-sm btn-danger" style={{ fontSize: '.75rem', padding: '.2rem .5rem' }} onClick={() => removeMember(t.id, m.email)}>
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {canManage(t) && <AddMemberRow teamId={t.id} onAdd={addMember} />}

              {/* ---- Dedicated Seat Assignment Quick Action ---- */}
              {canManage(t) && unassignedMembers.length > 0 && (
                <div style={{ marginTop: '1.25rem', padding: '.75rem 1rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px dashed var(--border)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.4rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                    <span>⭐ Quick Share Pro Seat</span>
                    <span className="dim" style={{ fontWeight: 400, fontSize: '.75rem' }}>— Teammates inherit full Pro features (unlimited tunnels, persistent URLs, custom domains)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={assigningSeat[t.id] || ''}
                      onChange={(e) => setAssigningSeat((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      style={{ flex: 1, minWidth: 200, fontSize: '.82rem' }}
                    >
                      <option value="">— Select a teammate to sponsor —</option>
                      {unassignedMembers.map((m) => (
                        <option key={m.email} value={m.email}>{m.email} ({m.role})</option>
                      ))}
                    </select>
                    <button
                      className="btn btn-sm"
                      disabled={!assigningSeat[t.id] || seatStats.available <= 0}
                      onClick={() => {
                        assignSeat(t.id, assigningSeat[t.id]);
                        setAssigningSeat((prev) => ({ ...prev, [t.id]: '' }));
                      }}
                    >
                      Assign Pro Seat
                    </button>
                  </div>
                  {seatStats.available <= 0 && (
                    <div style={{ fontSize: '.75rem', color: 'var(--yellow, #eab308)', marginTop: '.35rem' }}>
                      ⚠️ All purchased seats are currently allocated. {t.i_own && <Link to="/dashboard/plan" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>Purchase more seats</Link>}
                    </div>
                  )}
                </div>
              )}

              {/* ---- Team Tokens (SSH / Key Sharing) ---- */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: '.5rem' }}>
                  🔗 Team Tokens <span className="dim" style={{ fontWeight: 400, fontSize: '.78rem' }}>— shared with every member ({(t.tokens || []).length})</span>
                </div>
                {(t.tokens || []).length ? (
                  <table style={{ fontSize: '.82rem' }}>
                    <thead><tr><th>Token</th><th>Subdomain</th><th>Owner</th><th style={{ width: 100 }}></th></tr></thead>
                    <tbody>
                      {t.tokens.map((tk) => (
                        <tr key={tk.id}>
                          <td>{tk.name || 'Token'}</td>
                          <td className="code">{tk.subdomain || '—'}</td>
                          <td className="dim">{tk.owner_email}</td>
                          <td>
                            {canManage(t) && (
                              <button className="btn btn-sm btn-ghost" onClick={() => unassignToken(tk.id, t.name)}>Unassign</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="empty" style={{ padding: '.4rem 0' }}>No tokens shared with this team yet.</p>
                )}
                {canManage(t) && (
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.6rem', flexWrap: 'wrap' }}>
                    <select
                      id={`assigntok-${t.id}`}
                      style={{ flex: 1, minWidth: 220 }}
                    >
                      <option value="">— share one of your tokens —</option>
                      {myTokens
                        .filter((mt) => !(mt.via_team && !mt.via_team.owner) && (!mt.team_id || mt.team_id === t.id))
                        .map((mt) => (
                          <option key={mt.id} value={mt.id}>
                            {mt.name || mt.subdomain}{mt.team_id === t.id ? ' (already shared)' : ''}
                          </option>
                        ))}
                    </select>
                    <button
                      className="btn btn-sm"
                      onClick={() => assignToken(t.id, document.getElementById(`assigntok-${t.id}`).value)}
                    >Share token</button>
                  </div>
                )}
              </div>

              {/* ---- Recent Activity ---- */}
              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                  <div style={{ fontSize: '.85rem', fontWeight: 600 }}>🕐 Recent Activity</div>
                  <button className="btn btn-sm btn-ghost" onClick={() => loadActivity(t.id)}>Load</button>
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-dim)' }}>
                  {activity[t.id] === undefined && "Click Load to fetch the team's recent events."}
                  {activity[t.id] === 'loading' && 'Loading…'}
                  {Array.isArray(activity[t.id]) && (
                    activity[t.id].length ? activity[t.id].map((e, i) => (
                      <div key={i} style={{ display: 'flex', gap: '.6rem', padding: '.25rem 0', borderBottom: '1px solid var(--border)' }}>
                        <span className="dim" style={{ minWidth: 110 }}>{e.at ? new Date(e.at).toLocaleString() : ''}</span>
                        <span style={{ minWidth: 140 }}>{e.actor}</span>
                        <span><span className="badge">{e.action}</span> {e.target || ''}</span>
                      </div>
                    )) : 'No activity yet.'
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {delOpen && (
        <Modal title={`Delete team "${delOpen.name}"?`} confirmLabel="Delete" onConfirm={deleteTeam} onClose={() => setDelOpen(null)}>
          <p className="dim" style={{ fontSize: '.85rem' }}>Members lose access. Tunnels stay online (unassigned from the team).</p>
        </Modal>
      )}
    </>
  );
}

function AddMemberRow({ teamId, onAdd }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  return (
    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="teammate@email.com"
        style={{ flex: 1, minWidth: 200 }}
      />
      <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 'auto' }}>
        <option value="member">member</option>
        <option value="admin">admin</option>
      </select>
      <button className="btn btn-sm" onClick={() => { onAdd(teamId, email, role); setEmail(''); }}>Add member</button>
    </div>
  );
}