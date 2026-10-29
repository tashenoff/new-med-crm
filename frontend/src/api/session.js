import axios from 'axios';

export const API_BASE_URL = `${import.meta.env?.VITE_BACKEND_URL || ''}/api`;
export const AUTH_ERROR_EVENT = 'medcrm:auth-error';
let revision = 0;
const configuredClients = new WeakSet();

export const sessionSnapshot = () => ({ token: localStorage.getItem('token'), revision });
export const isCurrentSession = (session) => Boolean(session?.token) &&
  session.token === localStorage.getItem('token') && session.revision === revision;

// Pending requests belong to the earlier session even when a rapid re-login
// happens to return an identical JWT string.
export function invalidateSessionRequests() {
  revision += 1;
}

export function storeSessionToken(token) {
  invalidateSessionRequests();
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export const isPasswordExpiredError = (error) => error.response?.status === 401 &&
  error.response?.data?.detail === 'Password expired';

export function configureSessionHandling(client) {
  if (configuredClients.has(client)) return client;
  configuredClients.add(client);
  client.interceptors.request.use((config) => {
    const target = new URL(client.getUri(config), window.location.origin);
    const api = new URL(API_BASE_URL, window.location.origin);
    if (target.origin !== api.origin || !target.pathname.startsWith(`${api.pathname}/`)) return config;
    config.authSession = sessionSnapshot();
    config.authEntryPoint = ['/auth/login', '/auth/register'].some(path => target.pathname === `${api.pathname}${path}`);
    if (config.authSession.token) config.headers.set('Authorization', `Bearer ${config.authSession.token}`);
    else config.headers.delete('Authorization');
    return config;
  });
  client.interceptors.response.use(response => response, (error) => {
    const config = error.config;
    if (error.response?.status === 401 && !config?.authEntryPoint && isCurrentSession(config?.authSession)) {
      window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT, {
        detail: { session: config.authSession, passwordExpired: isPasswordExpiredError(error) },
      }));
    }
    return Promise.reject(error);
  });
  return client;
}

// Existing screens use both the default Axios client and apiClient.
export const authHttp = configureSessionHandling(axios);
