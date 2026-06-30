/**
 * TODO: Implement API client
 * - Base URL configuration (dev vs prod)
 * - JWT token injection via interceptor
 * - Request/response error handling
 * - Type-safe API calls using @codingkitty/shared types
 */

const BASE_URL = 'http://172.19.66.228:3000/api';

/** Generic fetch wrapper with auth header injection */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // TODO: Get token from secure storage
  const token = '';

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
};
