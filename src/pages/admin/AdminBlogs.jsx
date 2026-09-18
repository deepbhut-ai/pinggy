import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { Pagination, SearchBar } from '../../components/TableControls';

export default function AdminBlogs() {
  const toast = useToast();
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [editBlog, setEditBlog] = useState(null); // null = closed, {} = new or existing
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    slug: '',
    category: 'Engineering',
    author: 'IRAGT Team',
    read_time: '5 min read',
    summary: '',
    content: '',
    featured: false,
    published: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/blogs?all=true');
      setBlogs(data || []);
    } catch (e) {
      toast(e.message || 'Failed to load blogs', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({
      title: '',
      slug: '',
      category: 'Tutorial',
      author: 'IRAGT Team',
      read_time: '5 min read',
      summary: '',
      content: '',
      featured: false,
      published: true,
    });
    setEditBlog({ isNew: true });
  };

  const openEdit = async (b) => {
    try {
      const full = await api(`/blogs/${b.id}`);
      setForm({
        title: full.title || '',
        slug: full.slug || '',
        category: full.category || 'Engineering',
        author: full.author || 'IRAGT Team',
        read_time: full.read_time || '5 min read',
        summary: full.summary || '',
        content: full.content || '',
        featured: Boolean(full.featured),
        published: Boolean(full.published),
      });
      setEditBlog(full);
    } catch (e) {
      toast(e.message || 'Failed to fetch blog details', 'error');
    }
  };

  const handleTitleChange = (val) => {
    const autoSlug = val.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
    setForm((prev) => ({
      ...prev,
      title: val,
      slug: editBlog?.isNew ? autoSlug : prev.slug || autoSlug,
    }));
  };

  const saveBlog = async () => {
    if (!form.title.trim()) return toast('Title is required', 'error');
    if (!form.content.trim()) return toast('Content is required', 'error');

    setSaving(true);
    try {
      if (editBlog.isNew) {
        await api('/blogs', 'POST', form);
        toast('🎉 Blog post published successfully!');
      } else {
        await api(`/blogs/${editBlog.id}`, 'PUT', form);
        toast('✅ Blog post updated successfully!');
      }
      setEditBlog(null);
      load();
    } catch (e) {
      toast(e.message || 'Failed to save blog post', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (b) => {
    try {
      await api(`/blogs/${b.id}`, 'PUT', { published: !b.published });
      toast(`Post "${b.title}" is now ${b.published ? 'Draft (Hidden)' : 'Published'}`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const deleteBlog = async () => {
    if (!deleteConfirm) return;
    try {
      await api(`/blogs/${deleteConfirm.id}`, 'DELETE');
      toast(`Deleted "${deleteConfirm.title}"`);
      setDeleteConfirm(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // Filter & pagination
  const categories = ['All', ...new Set(blogs.map((b) => b.category).filter(Boolean))];
  const q = search.trim().toLowerCase();
  const filtered = blogs.filter((b) => {
    const matchQ = !q || (b.title || '').toLowerCase().includes(q) || (b.summary || '').toLowerCase().includes(q) || (b.slug || '').toLowerCase().includes(q);
    const matchCat = filterCategory === 'All' || (b.category || '').toLowerCase() === filterCategory.toLowerCase();
    return matchQ && matchCat;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      <div className="page-toolbar">
        <div>
          <div className="page-title">Blog Management</div>
          <div className="page-subtitle">Create, edit, and publish articles for the public blog (/blog)</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => { load(); toast('Refreshed'); }}>🔄 Refresh</button>
          <button className="btn btn-sm" onClick={openCreate}>+ New Blog Post</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>Articles ({filtered.length})</h2>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
              style={{ padding: '.4rem .8rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.85rem' }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>
              ))}
            </select>
            <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search title, slug, summary…" />
          </div>
        </div>

        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Title / Slug</th>
                <th>Category</th>
                <th>Author</th>
                <th>Read Time</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {b.featured && <span title="Featured" style={{ marginRight: 4 }}>⭐</span>}
                      {b.title}
                    </div>
                    <div className="dim code" style={{ fontSize: '.75rem', marginTop: 2 }}>
                      <a href={`/blog/${b.slug}`} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>
                        /blog/{b.slug} ↗
                      </a>
                    </div>
                  </td>
                  <td><span className="badge">{b.category}</span></td>
                  <td className="dim">{b.author}</td>
                  <td className="dim">{b.read_time}</td>
                  <td>
                    <span className={`badge ${b.published ? 'badge-green' : ''}`}>
                      {b.published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="dim" style={{ fontSize: '.8rem' }}>
                    {String(b.published_at || b.created_at || '').substring(0, 10)}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title={b.published ? 'Unpublish to draft' : 'Publish live'} onClick={() => togglePublish(b)}>
                      {b.published ? '🙈' : '👁️'}
                    </button>{' '}
                    <button className="icon-btn" title="Edit post" onClick={() => openEdit(b)}>
                      ✏️
                    </button>{' '}
                    <button className="icon-btn" title="Delete post" onClick={() => setDeleteConfirm(b)}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              {!paged.length && (
                <tr>
                  <td colSpan="7" className="empty">
                    {loading ? 'Loading blog posts…' : 'No blog posts found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={safePage} totalPages={totalPages} setPage={setPage} total={filtered.length} pageSize={pageSize} />
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {editBlog && (
        <Modal
          title={editBlog.isNew ? '✍️ Create New Blog Post' : `✏️ Edit: ${editBlog.title}`}
          confirmLabel={saving ? 'Saving…' : editBlog.isNew ? 'Publish Post' : 'Save Changes'}
          onConfirm={saveBlog}
          onClose={() => setEditBlog(null)}
        >
          <div style={{ maxHeight: '75vh', overflowY: 'auto', paddingRight: '.5rem' }}>
            <div className="form-group">
              <label>Article Title *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. How to use Custom Domains with SSH Tunnels"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>URL Slug (e.g. /blog/my-slug) *</label>
                <input
                  type="text"
                  required
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="my-post-slug"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Tutorial, Security, Engineering, etc."
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Author Name</label>
                <input
                  type="text"
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  placeholder="IRAGT Team"
                />
              </div>
              <div className="form-group">
                <label>Read Time</label>
                <input
                  type="text"
                  value={form.read_time}
                  onChange={(e) => setForm({ ...form, read_time: e.target.value })}
                  placeholder="5 min read"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Summary / Excerpt (shown on blog index cards)</label>
              <textarea
                rows="2"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Brief summary explaining what this post covers..."
              />
            </div>

            <div className="form-group">
              <label>Article Content (HTML supported) *</label>
              <textarea
                rows="10"
                required
                style={{ fontFamily: 'var(--mono)', fontSize: '.85rem', lineHeight: 1.6 }}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="<p>Write your article content here...</p><h2>Subheading</h2><p>Supports HTML tags & code blocks.</p>"
              />
              <div className="dim" style={{ fontSize: '.75rem', marginTop: 4 }}>
                Supports standard HTML: &lt;p&gt;, &lt;h2&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;pre&gt;&lt;code&gt;, &lt;a&gt;, &lt;div class="ptip"&gt;.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', padding: '.75rem', background: 'var(--surface-1)', borderRadius: 'var(--radius)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', margin: 0, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                />
                Published (Visible on public /blog)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', margin: 0, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                />
                ⭐ Featured Post
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteConfirm && (
        <Modal
          title={`Delete "${deleteConfirm.title}"?`}
          confirmLabel="Delete Post"
          onConfirm={deleteBlog}
          onClose={() => setDeleteConfirm(null)}
        >
          <p className="dim">Are you sure you want to delete this blog post? This action cannot be undone.</p>
        </Modal>
      )}
    </>
  );
}
