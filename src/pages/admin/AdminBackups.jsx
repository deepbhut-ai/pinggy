import { useEffect, useState, useCallback, useRef } from 'react';
import { api, downloadFile, uploadFile } from '../../api/client';
import { useToast } from '../../components/Toast';
import { SearchBar, Pagination } from '../../components/TableControls';
import Modal from '../../components/Modal';

// Admin: DB Backup & Restore Manager
// APIs:
//   GET /admin/backups
//   POST /admin/backups/create
//   GET /admin/backups/download/{filename}
//   POST /admin/backups/upload
//   POST /admin/backups/restore
//   DELETE /admin/backups/{filename}

export default function AdminBackups() {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [data, setData] = useState({ backups: [], total_count: 0, total_size_formatted: '0 KB', backup_directory: '' });
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Modals state
  const [restoreModalFile, setRestoreModalFile] = useState(null);
  const [deleteModalFile, setDeleteModalFile] = useState(null);
  const [restoreInputText, setRestoreInputText] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api('/admin/backups');
      setData(res || { backups: [], total_count: 0, total_size_formatted: '0 KB', backup_directory: '' });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      const res = await api('/admin/backups/create', 'POST');
      toast(res.message || 'Backup created successfully!');
      await load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.sql') && !file.name.endsWith('.gz') && !file.name.endsWith('.sql.gz')) {
      toast('Please upload a .sql or .sql.gz backup file', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setUploading(true);
      const res = await uploadFile('/admin/backups/upload', file);
      toast(res.message || 'Backup uploaded successfully');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (filename) => {
    try {
      toast(`Downloading ${filename}…`);
      await downloadFile(`/admin/backups/download/${encodeURIComponent(filename)}`, filename);
      toast(`Download ready: ${filename}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handleRestore = async () => {
    if (!restoreModalFile) return;
    if (restoreInputText.trim() !== 'RESTORE') {
      toast('Please type RESTORE to confirm', 'error');
      return;
    }
    try {
      const res = await api('/admin/backups/restore', 'POST', { filename: restoreModalFile.filename });
      toast(res.message || 'Database restored successfully!');
      if (res.safety_backup) {
        toast(`Safety snapshot saved: ${res.safety_backup}`);
      }
      setRestoreModalFile(null);
      setRestoreInputText('');
      await load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handleCleanup = async () => {
    try {
      const res = await api('/admin/backups/cleanup?keep_days=7', 'POST');
      toast(res.message || 'Retention cleanup complete');
      await load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteModalFile) return;
    try {
      const res = await api(`/admin/backups/${encodeURIComponent(deleteModalFile.filename)}`, 'DELETE');
      toast(res.message || 'Backup deleted');
      setDeleteModalFile(null);
      await load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? (data.backups || []).filter((b) => (b.filename || '').toLowerCase().includes(q))
    : data.backups || [];

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Database Backup & Restore</div>
          <div className="page-subtitle">Manage PostgreSQL dumps, download archives, and restore system state</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.35rem' }}>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".sql,.gz,.sql.gz"
              style={{ display: 'none' }}
            />
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || loading || creating}
            >
              {uploading ? '⏳ Uploading…' : '⬆️ Upload Backup'}
            </button>
            <button
              className="btn btn-sm"
              onClick={handleCreateBackup}
              disabled={creating || loading || uploading}
            >
              {creating ? '⏳ Creating…' : '➕ Create Backup Now'}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                load();
                toast('Refreshed');
              }}
              disabled={loading}
            >
              🔄
            </button>
          </div>
          <div className="dim" style={{ fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <span>Accepted file formats:</span>
            <span className="badge badge-blue" style={{ fontSize: '.7rem', padding: '1px 5px' }}>.sql</span>
            <span className="badge badge-green" style={{ fontSize: '.7rem', padding: '1px 5px' }}>.sql.gz</span>
            <span className="badge badge-green" style={{ fontSize: '.7rem', padding: '1px 5px' }}>.gz</span>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="dim" style={{ fontSize: '.8rem', marginBottom: '.35rem' }}>TOTAL BACKUPS</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>{data.total_count || 0}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="dim" style={{ fontSize: '.8rem', marginBottom: '.35rem' }}>STORAGE USED</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>{data.total_size_formatted || '0 KB'}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="dim" style={{ fontSize: '.8rem', marginBottom: '.35rem' }}>AUTO-BACKUP SCHEDULE</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#10b981' }}>3× Daily (Every 8h)</div>
          <div className="dim" style={{ fontSize: '.75rem', marginTop: '.25rem' }}>Automatic background worker</div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="dim" style={{ fontSize: '.8rem', marginBottom: '.35rem' }}>RETENTION POLICY</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#3b82f6' }}>7 Days Auto-Purge</div>
          <div className="dim" style={{ fontSize: '.75rem', marginTop: '.25rem' }}>Backups older than 7d removed</div>
        </div>
      </div>

      {/* Safety & Retention Notice */}
      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '4px solid #10b981' }}>
        <div className="card-body" style={{ fontSize: '.85rem', lineHeight: '1.5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
          <div>
            ⏰ <strong>Automated Schedule & Retention:</strong> Database backups are automatically created <strong>3 times daily</strong> (every 8 hours) with an automated <strong>7-day retention policy</strong> that purges older snapshots. Every restore also generates a pre-restore rollback backup.
          </div>
          <button className="btn btn-xs btn-ghost" onClick={handleCleanup} title="Purge backups older than 7 days now">
            🧹 Clean Old Backups (&gt;7d)
          </button>
        </div>
      </div>

      {/* Backups List Card */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
          <h2>Available Backups ({data.backups?.length || 0})</h2>
          <div style={{ width: '260px' }}>
            <SearchBar
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search filename…"
            />
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Backup File</th>
                <th>Size</th>
                <th>Created At (UTC)</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((b) => (
                <tr key={b.filename}>
                  <td>
                    <span className="code" style={{ fontWeight: 600 }}>{b.filename}</span>
                  </td>
                  <td>{b.size_formatted}</td>
                  <td className="dim" style={{ whiteSpace: 'nowrap' }}>
                    {b.created_at ? b.created_at.substring(0, 19).replace('T', ' ') : '—'}
                  </td>
                  <td>
                    {b.is_compressed ? (
                      <span className="badge badge-green">GZIP (.gz)</span>
                    ) : (
                      <span className="badge badge-blue">SQL</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-xs btn-ghost"
                      style={{ marginRight: '.35rem' }}
                      title="Download Backup"
                      onClick={() => handleDownload(b.filename)}
                    >
                      📥 Download
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      style={{ marginRight: '.35rem', color: '#f59e0b' }}
                      title="Restore from this backup"
                      onClick={() => {
                        setRestoreModalFile(b);
                        setRestoreInputText('');
                      }}
                    >
                      🔄 Restore
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      style={{ color: '#ef4444' }}
                      title="Delete Backup"
                      onClick={() => setDeleteModalFile(b)}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              {!paged.length && (
                <tr>
                  <td colSpan="5" className="empty">
                    {loading ? 'Loading backups…' : 'No backup files found. Click "Create Backup Now" to make one.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="card-body" style={{ paddingTop: '.5rem' }}>
            <Pagination
              page={page}
              totalPages={totalPages}
              setPage={setPage}
              total={filtered.length}
              pageSize={pageSize}
            />
          </div>
        )}
      </div>

      {/* Restore Safeguard Modal */}
      {restoreModalFile && (
        <Modal
          title="⚠️ Confirm Database Restore"
          confirmLabel="Execute Restore"
          onConfirm={handleRestore}
          onClose={() => {
            setRestoreModalFile(null);
            setRestoreInputText('');
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px' }}>
              <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '.25rem' }}>WARNING: Active Data Overwrite</div>
              <div style={{ fontSize: '.85rem' }}>
                Restoring this backup will replace current tables and data in the PostgreSQL database with the contents of:
                <br />
                <strong className="code">{restoreModalFile.filename}</strong> ({restoreModalFile.size_formatted}).
              </div>
            </div>

            <div style={{ fontSize: '.85rem', color: '#9ca3af' }}>
              An automatic safety backup will be created right before restoring so you can roll back at any time.
            </div>

            <div className="form-group">
              <label style={{ fontSize: '.85rem' }}>
                Type <strong style={{ color: '#f59e0b' }}>RESTORE</strong> to confirm:
              </label>
              <input
                type="text"
                value={restoreInputText}
                onChange={(e) => setRestoreInputText(e.target.value)}
                placeholder="RESTORE"
                autoFocus
              />
            </div>

            {restoreInputText !== 'RESTORE' && (
              <div style={{ fontSize: '.75rem', color: '#f59e0b' }}>
                Please type RESTORE above to enable the confirm button.
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalFile && (
        <Modal
          title="Delete Backup File"
          confirmLabel="Delete File"
          onConfirm={handleDelete}
          onClose={() => setDeleteModalFile(null)}
        >
          <p>
            Are you sure you want to permanently delete the backup file{' '}
            <strong className="code">{deleteModalFile.filename}</strong>?
          </p>
          <p className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>
            This action cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}
