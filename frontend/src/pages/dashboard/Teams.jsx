import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

// Teams — full role control, token sharing, activity feed (like legacy)
export default function Teams() {
  const { user } = useAuth();
  const toast = useToast();
  const [teams, setTeams] = useState([]);
  const [myTokens, setMyTokens] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [delOpen, setDelOpen] = useState(null); // team
  const [activity, setActivity] = useState({}); // teamId -> entries|'loading'|null

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
      <h2 style={{ marginBottom: '1rem' }}>Teams</h2>
      <p className="dim" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>
        Invite teammates with role-based access — <strong>owner</strong> controls roles &amp; everything, <strong>admin</strong> manages members &amp; shared tokens, <strong>member</strong> can view &amp; use shared tokens read-only
      </p>

      <div className="card">
        <div className="card-header"><h2>Create a Team</h2></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="e.g. Platform Team" style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={createTeam}>Create Team</button>
          </div>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="card"><div className="card-body"><p className="empty">No teams yet — create your first team above.</p></div></div>
      ) : teams.map((t) => (
        <div className="card" key={t.id} style={{ marginTop: '1rem' }}>
          <div className="card-header">
            <h2>👥 {t.name} {roleBadge(t.my_role)}</h2>
            {t.i_own && (
              <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)' }} onClick={() => setDelOpen(t)}>Delete team</button>
            )}
          </div>
          <div className="card-body">
            <table style={{ fontSize: '.85rem' }}>
              <thead><tr><th>Member</th><th>Role</th><th style={{ width: 220 }}></th></tr></thead>
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
                            style={{ width: 'auto', padding: '.25rem .5rem' }}
                          >
                            <option value="member">member</option>
                            <option value="admin">admin</option>
                          </select>
                        ) : roleBadge(isOwnerRow ? 'owner' : m.role)}
                      </td>
                      <td>
                        {canRemove && (
                          <button className="btn btn-sm btn-danger" onClick={() => removeMember(t.id, m.email)}>Remove</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {canManage(t) && <AddMemberRow teamId={t.id} onAdd={addMember} />}

            {/* Team tokens */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: '.5rem' }}>
                🔗 Team tokens <span className="dim" style={{ fontWeight: 400, fontSize: '.78rem' }}>— shared with every member ({(t.tokens || []).length})</span>
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

            {/* Activity */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                <div style={{ fontSize: '.85rem', fontWeight: 600 }}>🕐 Recent activity</div>
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
      ))}

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