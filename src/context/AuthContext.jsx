import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, clearToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Validate the stored token on mount — replaces the legacy checkAuth() + bfcache hacks
  useEffect(() => {
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api('/auth/me');
        setUser(me);
      } catch {
        clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', 'POST', { email, password });
    // 2FA flow — caller (Login page) handles the otp_required response
    if (data.otp_required) return data;
    setToken(data.access_token);
    setUser(data.user);
    return data;
  }, []);

  const verifyOtp = useCallback(async (challenge, code) => {
    const data = await api('/auth/verify-otp', 'POST', { challenge, code });
    setToken(data.access_token);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (email, password, fullName) => {
    return api('/auth/register', 'POST', {
      email,
      password,
      full_name: fullName || undefined,
      role: 'user',
    });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api('/auth/me');
    setUser(me);
    return me;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyOtp, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}