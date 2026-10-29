import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeForUser } from '../utils/permissions';
import {
  API_BASE_URL as API, AUTH_ERROR_EVENT, authHttp, sessionSnapshot,
  isCurrentSession, invalidateSessionRequests, storeSessionToken, isPasswordExpiredError,
} from '../api/session';

const AuthContext = createContext();
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [verificationError, setVerificationError] = useState(null);
  const [showPasswordExpiredModal, setShowPasswordExpiredModal] = useState(false);
  const inFlight = useRef(null);
  const tokenRef = useRef(token);
  const navigate = useNavigate();

  const logout = useCallback(() => {
    storeSessionToken(null);
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setShowPasswordExpiredModal(false);
    setVerificationError(null);
    setLoading(false);
  }, []);

  const fetchCurrentUser = useCallback(() => {
    const session = sessionSnapshot();
    if (!session.token) return Promise.resolve();
    if (inFlight.current && isCurrentSession(inFlight.current.session)) return inFlight.current.promise;
    const request = { session };
    request.promise = (async () => {
      try {
        const response = await authHttp.get(`${API}/auth/me`, { timeout: 30000 });
        if (!isCurrentSession(session)) return;
        setUser(response.data);
        setShowPasswordExpiredModal(false);
        setVerificationError(null);
        if (window.location.pathname === '/') navigate(homeForUser(response.data));
      } catch (error) {
        if (!isCurrentSession(session)) return;
        if (isPasswordExpiredError(error)) {
          setShowPasswordExpiredModal(true);
        } else if (error.response?.status !== 401) {
          // A rejected profile permission check blocks the cabinet, while a
          // transient failure retains a previously verified user.
          if (error.response?.status === 403) setUser(null);
          setVerificationError(error.response?.status === 403
            ? 'Не удалось подтвердить доступ к кабинету. Повторите проверку или обратитесь к администратору.'
            : 'Не удалось связаться с сервером. Проверьте соединение и повторите попытку.');
        }
      } finally {
        if (isCurrentSession(session)) setLoading(false);
        if (inFlight.current === request) inFlight.current = null;
      }
    })();
    inFlight.current = request;
    return request.promise;
  }, [navigate]);

  useEffect(() => {
    const onAuthError = ({ detail }) => {
      if (!isCurrentSession(detail?.session)) return;
      if (detail.passwordExpired) {
        invalidateSessionRequests();
        setShowPasswordExpiredModal(true);
        setLoading(false);
      } else logout();
    };
    const onStorage = (event) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      if (event.key !== 'token' && event.key !== null) return;
      const nextToken = localStorage.getItem('token');
      if (nextToken === tokenRef.current) return;
      invalidateSessionRequests();
      tokenRef.current = nextToken;
      setToken(nextToken);
      setUser(null);
      setShowPasswordExpiredModal(false);
      setVerificationError(null);
      setLoading(Boolean(nextToken));
    };
    window.addEventListener(AUTH_ERROR_EVENT, onAuthError);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AUTH_ERROR_EVENT, onAuthError);
      window.removeEventListener('storage', onStorage);
    };
  }, [logout]);

  useEffect(() => {
    if (token) fetchCurrentUser();
    else setLoading(false);
  }, [token, fetchCurrentUser]);

  useEffect(() => {
    if (!token) return;
    const refresh = () => { if (!document.hidden) fetchCurrentUser(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      clearInterval(timer);
    };
  }, [token, fetchCurrentUser]);

  const acceptToken = (accessToken) => {
    storeSessionToken(accessToken);
    tokenRef.current = accessToken;
    setUser(null);
    setShowPasswordExpiredModal(false);
    setVerificationError(null);
    setLoading(true);
    setToken(accessToken);
    // Explicitly verify even when React retains an identical token state.
    fetchCurrentUser();
  };

  const login = async (email, password, rememberMe = false) => {
    try {
      const response = await authHttp.post(`${API}/auth/login`, { email, password, remember_me: rememberMe });
      acceptToken(response.data.access_token);
      navigate(homeForUser(response.data.user));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Ошибка входа' };
    }
  };

  const register = async (email, password, fullName, role = 'patient') => {
    try {
      const response = await authHttp.post(`${API}/auth/register`, { email, password, full_name: fullName, role });
      acceptToken(response.data.access_token);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Ошибка регистрации' };
    }
  };

  const retrySession = () => {
    setLoading(true);
    setVerificationError(null);
    return fetchCurrentUser();
  };
  const handlePasswordChanged = () => {
    invalidateSessionRequests();
    setShowPasswordExpiredModal(false);
    setUser(null);
    return retrySession();
  };

  return <AuthContext.Provider value={{ user, token, login, register, logout, loading, verificationError,
    retrySession, showPasswordExpiredModal, handlePasswordChanged }}>{children}</AuthContext.Provider>;
}

export default AuthContext;
