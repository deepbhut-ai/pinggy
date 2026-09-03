import { useEffect, useState } from 'react';
import { api } from '../../api/client';

// Announcements — level-colored cards with dates (like legacy)
export default function Announcements() {
  const [anns, setAnns] = useState([]);

  useEffect(() => {
    api('/announcements').then(setAnns).catch(() => {});
  }, []);

  const color = { warning: '#f59e0b', success: '#22c55e', info: 'var(--brand)' };

  return (
    <>
      <div className="page-title">Announcements</div>
      <div className="page-subtitle">News and updates from the team</div>
      {anns.length === 0 ? (
        <div className="card"><div className="card-body"><p className="empty">No announcements right now.</p></div></div>
      ) : (
        anns.map((a) => (
          <div
            key={a.id}
            className="announcement"
            style={{ borderLeftColor: color[a.level] || color.info }}
          >
            <strong>{a.title}</strong>
            <div className="dim" style={{ fontSize: '.72rem', marginTop: '.15rem' }}>
              {a.created_at ? a.created_at.substring(0, 10) : ''}
            </div>
            <div className="announcement-body">{a.body}</div>
          </div>
        ))
      )}
    </>
  );
}