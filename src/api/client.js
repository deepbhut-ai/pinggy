// Central API client — mirrors the api() helper in the legacy dashboard.html.
// Adds the Bearer token to every request and redirects to /login on 401.

const API_BASE = '/api/v1';
const TOKEN_KEY = 'pinggy_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

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