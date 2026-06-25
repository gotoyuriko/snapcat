/**
 * TODO: Implement useAuth hook
 * - Manage authentication state
 * - Login / register / logout functions
 * - Store JWT in secure storage
 * - Auto-refresh token on expiry
 */

export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  token: string | null;
  loading: boolean;
}

export function useAuth(): AuthState & {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, displayName: string, password: string) => Promise<void>;
  logout: () => void;
} {
  // TODO: Implement with zustand or React context
  return {
    isAuthenticated: false,
    userId: null,
    token: null,
    loading: false,
    login: async (_email: string, _password: string) => {
      throw new Error('Not implemented');
    },
    register: async (_email: string, _displayName: string, _password: string) => {
      throw new Error('Not implemented');
    },
    logout: () => {
      // TODO: Clear token, disconnect socket
    },
  };
}
