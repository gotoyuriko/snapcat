/**
 * API client: JSON + multipart helpers with JWT injection and error surfacing.
 */
import {
  getToken,
  getRefreshToken,
  setTokens,
  notifyUnauthorized,
} from './authToken';

// Host is supplied at bundle time via EXPO_PUBLIC_API_URL (e.g. the backend's
// Cloudflare tunnel URL, set by start-tunnel.sh). Falls back to localhost for
// web / same-machine runs. EXPO_PUBLIC_* vars are inlined into the JS bundle.
const API_HOST = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const BASE_URL = `${API_HOST}/api`;

/**
 * Resolve a stored photo URL against the current API host.
 *
 * Photo paths are persisted host-less (e.g. "/api/recognition/photos/x.jpg")
 * because the tunnel hostname changes between sessions. Legacy rows may still
 * carry an absolute URL with a stale tunnel host — those are re-pointed at
 * the current host. Anything else (external URLs) passes through unchanged.
 */
export function resolvePhotoUrl(url: string): string;
export function resolvePhotoUrl(url: string | null | undefined): string | null;
export function resolvePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return `${API_HOST}${url}`;
  const legacy = url.match(/^https?:\/\/[^/]+(\/api\/recognition\/photos\/.+)$/);
  if (legacy) return `${API_HOST}${legacy[1]}`;
  return url;
}

/** Error thrown for non-2xx responses; carries the status + raw body for callers. */
export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`API Error: ${status} ${statusText}${body ? ` — ${body}` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
  /** Best-effort human message from a JSON `{error|message|detail}` body. */
  get serverMessage(): string | null {
    try {
      const j = JSON.parse(this.body);
      return j.error ?? j.message ?? j.detail ?? null;
    } catch {
      return null;
    }
  }

  /** User-facing message: maps known server errors to plain language, hides raw JSON/status codes. */
  get friendlyMessage(): string {
    const server = this.serverMessage;

    if (server === 'Invalid credentials') {
      return 'Incorrect email or password.';
    }
    if (server === 'Email already in use') {
      return 'An account with this email already exists. Try logging in instead.';
    }
    if (server === 'Validation failed') {
      try {
        const j = JSON.parse(this.body);
        const fieldErrors = j.details?.fieldErrors ?? {};
        const firstField = Object.keys(fieldErrors).find((k) => fieldErrors[k]?.length);
        if (firstField === 'email') return 'Please enter a valid email address.';
        if (firstField === 'password') return 'Please enter a valid password.';
        if (firstField) return `Please check the ${firstField} field and try again.`;
      } catch {
        // fall through to generic message below
      }
      return 'Please check your details and try again.';
    }
    if (this.status === 0) {
      return 'Unable to reach the server. Check your connection and try again.';
    }
    if (this.status >= 500) {
      return 'Something went wrong on our end. Please try again shortly.';
    }
    return 'Something went wrong. Please try again.';
  }
}

// Dedupe concurrent refreshes: if several requests 401 at once (e.g. on app
// load), they share a single /auth/refresh call instead of racing it (which
// would rotate the refresh token out from under each other).
let refreshPromise: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const { accessToken, refreshToken: newRefresh } = await res.json();
        await setTokens(accessToken, newRefresh);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Generic fetch wrapper: injects the Bearer token, sets JSON content-type
 * (unless sending FormData), transparently refreshes an expired access token
 * once on 401, and surfaces the server's error body in thrown errors.
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  isForm = false,
  retried = false,
): Promise<T> {
  const token = getToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Access token likely expired — refresh once and retry. Skip for /auth/* (login,
  // refresh) so a bad-credentials 401 doesn't trigger a refresh loop.
  if (response.status === 401 && token && !retried && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) {
      return apiFetch<T>(path, options, isForm, true);
    }
    // Refresh token gone/expired → session is over; bounce to login.
    notifyUnauthorized();
  }

  if (!response.ok) {
    let body = '';
    try {
      body = (await response.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, response.statusText, body);
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
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
};
