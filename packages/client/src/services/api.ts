/**
 * API client: JSON + multipart helpers with JWT injection and error surfacing.
 */
import { getToken } from './authToken';

// Host is supplied at bundle time via EXPO_PUBLIC_API_URL (e.g. the backend's
// Cloudflare tunnel URL, set by start-tunnel.sh). Falls back to localhost for
// web / same-machine runs. EXPO_PUBLIC_* vars are inlined into the JS bundle.
const API_HOST = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const BASE_URL = `${API_HOST}/api`;

/**
 * Generic fetch wrapper: injects the Bearer token, sets JSON content-type
 * (unless sending FormData, where fetch must set the multipart boundary itself),
 * and surfaces the server's error body in thrown errors for easier debugging.
 */
async function apiFetch<T>(path: string, options: RequestInit = {}, isForm = false): Promise<T> {
  const token = getToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = ` — ${(await response.text()).slice(0, 300)}`;
    } catch {
      /* ignore */
    }
    throw new Error(`API Error: ${response.status} ${response.statusText}${detail}`);
  }

  // Some endpoints (e.g. 204) return no body.
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  /** POST multipart/form-data (file uploads); do NOT set Content-Type manually. */
  postForm: <T>(path: string, form: FormData) =>
    apiFetch<T>(path, { method: 'POST', body: form as unknown as RequestInit['body'] }, true),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
};
