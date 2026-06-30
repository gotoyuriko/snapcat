/**
 * Authentication state (zustand store).
 *
 * - login/register call the backend, persist access + refresh tokens via
 *   authToken (SecureStore), and decode userId/email from the access token.
 * - initialize() hydrates persisted tokens on app startup; RootNavigation gates
 *   the app on `isAuthenticated` once `loading` is false.
 * - api.ts auto-refreshes expired access tokens; when the refresh token is also
 *   dead it calls the handler registered below, which logs the user out.
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
  /** Load any persisted tokens from secure storage (call once at startup). */
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
    const { accessToken, refreshToken } = await api.post<TokenResponse>('/auth/login', {
      email,
      password,
    });
    await setTokens(accessToken, refreshToken);
    set(applyToken(accessToken));
  },

  register: async (email, displayName, password) => {
    const { accessToken, refreshToken } = await api.post<TokenResponse>('/auth/register', {
      email,
      displayName,
      password,
    });
    await setTokens(accessToken, refreshToken);
    set(applyToken(accessToken));
  },

  logout: async () => {
    await clearTokens();
    set({ isAuthenticated: false, userId: null, token: null });
  },
}));

// When api.ts exhausts token refresh (refresh token expired/revoked), end the
// session so RootNavigation falls back to the Login screen.
setUnauthorizedHandler(() => {
  void clearTokens();
  useAuth.setState({ isAuthenticated: false, userId: null, token: null });
});
