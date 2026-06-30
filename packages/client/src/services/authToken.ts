/**
 * Access-token storage for the API/socket clients.
 *
 * The JWT is persisted in the device keychain via expo-secure-store and mirrored
 * in memory so request code (api.ts) can read it synchronously without awaiting
 * SecureStore on every call. Call loadToken() once at app startup to hydrate the
 * cache from disk.
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'codingkitty.accessToken';

let cachedToken: string | null = null;

/** Hydrate the in-memory token from secure storage (call once at startup). */
export async function loadToken(): Promise<string | null> {
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

/** Current access token (in-memory, synchronous) for request header injection. */
export function getToken(): string | null {
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
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
export function decodeJwt(token: string): { userId?: string; email?: string } {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(base64Decode(payload));
  } catch {
    return {};
  }
}
