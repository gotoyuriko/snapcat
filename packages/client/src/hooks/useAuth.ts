/**
 * Authentication state (zustand store).
 *
 * - login/register call the backend, persist the JWT via authToken (SecureStore),
 *   and decode userId/email from the token for the UI.
 * - initialize() hydrates the persisted token on app startup; RootNavigation
 *   gates the app on `isAuthenticated` once `loading` is false.
 */
import { create } from 'zustand';
import { api } from '../services/api';
import { loadToken, setToken, clearToken, decodeJwt, isTokenExpired, getToken } from '../services/authToken';

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  token: string | null;
  loading: boolean;
}

interface AuthActions {
  /** Load any persisted token from secure storage (call once at startup). */
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

function applyToken(accessToken: string) {
  const { userId } = decodeJwt(accessToken);
  return { token: accessToken, userId: userId ?? null, isAuthenticated: true };
}

export const useAuth = create<AuthState & AuthActions>((set) => ({
  isAuthenticated: false,
  userId: null,
  token: null,
  loading: true,

  initialize: async () => {
    const stored = await loadToken();
    if (stored && !isTokenExpired(stored)) {
      try {
        // loadToken() already cached the token so getToken() will return it for apiFetch
        await api.get('/auth/me');
        set({ ...applyToken(stored), loading: false });
      } catch {
        await clearToken();
        set({ isAuthenticated: false, userId: null, token: null, loading: false });
      }
    } else {
      if (stored) await clearToken();
      set({ isAuthenticated: false, userId: null, token: null, loading: false });
    }
  },

  login: async (email, password) => {
    const { accessToken } = await api.post<TokenResponse>('/auth/login', { email, password });
    await setToken(accessToken);
    set(applyToken(accessToken));
  },

  register: async (email, displayName, password) => {
    const { accessToken } = await api.post<TokenResponse>('/auth/register', {
      email,
      displayName,
      password,
    });
    await setToken(accessToken);
    set(applyToken(accessToken));
  },

  logout: async () => {
    await clearToken();
    set({ isAuthenticated: false, userId: null, token: null });
  },
}));
