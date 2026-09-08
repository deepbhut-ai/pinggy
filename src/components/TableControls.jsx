import { useState, useMemo, useCallback } from 'react';

// Shared search + pagination hook for any table page.
// Pass in the full data array and optional config; get back filtered+paginated
// slice plus the search input, page state, and controls.
//
// Usage:
//   const { search, setSearch, page, setPage, paged, total, totalPages, pageSize } =
//     useTableData(data, { searchKeys: ['name', 'subdomain'], pageSize: 10 });
export function useTableData(data, opts = {}) {
  const { searchKeys = [], pageSize: ps = 10, filterFn } = opts;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = ps;

  const sKeys = Array.isArray(searchKeys) ? searchKeys : [];
  const filtered = useMemo(() => {
    let result = Array.isArray(data) ? data : [];
    if (search.trim() && sKeys.length) {
      const q = search.trim().toLowerCase();
      result = result.filter((row) =>
        sKeys.some((k) => {
          const v = row[k];
          return v != null && String(v).toLowerCase().includes(q);
        })
      );
    }
    if (typeof filterFn === 'function') {
      result = filterFn(result);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const setPageSafe = useCallback((p) => {
    setPage(Math.max(1, Math.min(p, totalPages)));
  }, [totalPages]);

  return {
    search, setSearch,
    page: safePage, setPage: setPageSafe,
    paged, filtered, total, totalPages, pageSize,
  };
}

// SearchBar — text input with a magnifier icon and clear button.
export function SearchBar({ value, onChange, placeholder = 'Search…', style }) {
  return (
    <div className="search-bar" style={style}>
      <span className="search-icon">🔍</span>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); }}
        placeholder={placeholder}
        className="search-input"
      />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} title="Clear search">✕</button>
      )}
    </div>
  );
}

// Pagination — prev/next + page numbers + "showing X–Y of Z" label.
export function Pagination({ page, totalPages, setPage, total, pageSize }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages = [];
  const maxButtons = 5;
  let startPage = Math.max(1, page - 2);
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  return (
    <div className="pagination-bar">
      <span className="pagination-info">Showing {from}–{to} of {total}</span>
      <div className="pagination-btns">
        <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</button>
        {startPage > 1 && <button className="btn btn-sm btn-ghost" onClick={() => setPage(1)}>1</button>}
        {startPage > 2 && <span className="pagination-ellipsis">…</span>}
        {pages.map((p) => (
          <button
            key={p}
            className={`btn btn-sm ${p === page ? '' : 'btn-ghost'}`}
            onClick={() => setPage(p)}
            style={p === page ? { fontWeight: 700 } : {}}
          >{p}</button>
        ))}
        {endPage < totalPages - 1 && <span className="pagination-ellipsis">…</span>}
        {endPage < totalPages && <button className="btn btn-sm btn-ghost" onClick={() => setPage(totalPages)}>{totalPages}</button>}
        <button className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next ›</button>
      </div>
    </div>
  );
}