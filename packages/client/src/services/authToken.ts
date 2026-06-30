/**
 * Token storage for the API/socket clients.
 *
 * Access + refresh tokens are persisted in the device keychain via
 * expo-secure-store and mirrored in memory so request code (api.ts) can read the
 * access token synchronously. Access tokens are short-lived (~15 min); api.ts
 * transparently refreshes them using the refresh token (~7 days).
 *
 * Call loadTokens() once at app startup to hydrate the cache from disk.
 */
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'codingkitty.accessToken';
const REFRESH_KEY = 'codingkitty.refreshToken';

let cachedAccess: string | null = null;
let cachedRefresh: string | null = null;

/** Hydrate both tokens from secure storage (call once at startup). */
export async function loadTokens(): Promise<string | null> {
  try {
    cachedAccess = await SecureStore.getItemAsync(ACCESS_KEY);
    cachedRefresh = await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    cachedAccess = null;
    cachedRefresh = null;
  }
  return cachedAccess;
}

/** Current access token (in-memory, synchronous) for header injection. */
export function getToken(): string | null {
  return cachedAccess;
}

export function getRefreshToken(): string | null {
  return cachedRefresh;
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  cachedAccess = accessToken;
  cachedRefresh = refreshToken;
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  cachedAccess = null;
  cachedRefresh = null;
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

// --- Session-expiry callback ---------------------------------------------
// api.ts calls notifyUnauthorized() when a refresh fails (refresh token expired
// or revoked); useAuth registers a handler that clears state and bounces to login.
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export function notifyUnauthorized(): void {
  onUnauthorized?.();
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Dependency-free base64 decode (no atob/Buffer globals needed under Hermes). */
function base64Decode(input: string): string {
  const str = input.replace(/=+$/, '');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = B64_CHARS.indexOf(str[i]);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * Decode a JWT payload without verifying the signature (the server verifies on
 * every request). Used only to surface userId/email to the UI. Returns {} on error.
 */
export function decodeJwt(token: string): { userId?: string; email?: string; exp?: number } {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(base64Decode(payload));
  } catch {
    return {};
  }
}

export function isTokenExpired(token: string): boolean {
  const { exp } = decodeJwt(token);
  if (!exp) return true;
  return Date.now() / 1000 >= exp;
}
