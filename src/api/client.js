// Central API client — mirrors the api() helper in the legacy dashboard.html.
// Adds the Bearer token to every request and redirects to /login on 401.

const API_BASE = '/api/v1';
const TOKEN_KEY = 'iragt_token';

export const getToken = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('iragt_impersonate');
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {},
  };
  const token = getToken();
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const resp = await fetch(`${API_BASE}${path}`, opts);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }));
    throw new ApiError(err.detail || `HTTP ${resp.status}`, resp.status);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

// Unauthenticated variants used by the login/signup screens
export const postPublic = (path, body) => api(path, 'POST', body);

export async function downloadFile(path, filename) {
  const token = getToken();
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }));
    throw new ApiError(err.detail || `HTTP ${resp.status}`, resp.status);
  }
  const blob = await resp.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function uploadFile(path, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }));
    throw new ApiError(err.detail || `HTTP ${resp.status}`, resp.status);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}