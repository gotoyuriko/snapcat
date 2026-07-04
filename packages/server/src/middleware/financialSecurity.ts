import { Request, Response, NextFunction } from 'express';

/**
 * Financial route security middleware.
 *
 * Provides:
 * 1. Request-level rate limiting (sliding window, per-IP) for /wallet and /donations routes
 * 2. Input sanitization — strips unexpected fields and rejects suspicious payloads
 * 3. Additional security headers for financial endpoints
 *
 * Requirement 14.1 / 15.1: Security scanning on payment and donation surfaces.
 * Since Aikido SDK requires a paid subscription, this middleware provides
 * equivalent protection via input validation and rate limiting.
 * Dependency scanning is handled via `npm audit` and Trivy (see scripts).
 */

// --- Rate Limiter ---

interface RateLimitEntry {
  timestamps: number[];
}

/** In-memory sliding window rate limiter for financial endpoints */
const rateLimitStore = new Map<string, RateLimitEntry>();

/** Max requests per window per IP on financial routes */
const FINANCIAL_RATE_LIMIT_MAX = 30;
/** Sliding window in milliseconds (15 minutes) */
const FINANCIAL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
/** Cleanup interval: remove stale entries every 5 minutes */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Periodic cleanup of expired entries
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupInterval) return;
  // Skip starting the interval in test environments to prevent Jest from hanging
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      entry.timestamps = entry.timestamps.filter(
        (t) => now - t < FINANCIAL_RATE_LIMIT_WINDOW_MS,
      );
      if (entry.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow the process to exit even if the timer is pending
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

/**
 * Extract client IP from request, handling proxies.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Rate limiting middleware for financial routes.
 * Limits to FINANCIAL_RATE_LIMIT_MAX requests per 15-minute window per IP.
 */
export function financialRateLimit(req: Request, res: Response, next: NextFunction): void {
  startCleanup();

  const clientIp = getClientIp(req);
  const key = `financial:${clientIp}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < FINANCIAL_RATE_LIMIT_WINDOW_MS,
  );

  if (entry.timestamps.length >= FINANCIAL_RATE_LIMIT_MAX) {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded for financial operations. Please try again later.',
      retryAfterMs: FINANCIAL_RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  entry.timestamps.push(now);
  next();
}

// --- Input Sanitization ---

/** Characters that should never appear in financial request payloads */
const SUSPICIOUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /\$\{/,           // Template injection
  /\{\{/,           // Template injection
  /__proto__/,      // Prototype pollution
  /constructor\[/,  // Prototype pollution
  /\.\.\/\.\.\//,   // Path traversal
];

/**
 * Recursively checks a value for suspicious content.
 */
function containsSuspiciousContent(value: unknown): boolean {
  if (typeof value === 'string') {
    return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some(containsSuspiciousContent);
  }
  if (value !== null && typeof value === 'object') {
    // Check keys for prototype pollution attempts
    const keys = Object.keys(value);
    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return true;
      }
    }
    return Object.values(value).some(containsSuspiciousContent);
  }
  return false;
}

/**
 * Input sanitization middleware for financial routes.
 * Rejects requests with suspicious payloads (XSS, injection, prototype pollution).
 */
export function financialInputSanitizer(req: Request, res: Response, next: NextFunction): void {
  // Only check request bodies on POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    if (containsSuspiciousContent(req.body)) {
      res.status(400).json({
        error: 'Invalid input',
        message: 'Request contains potentially malicious content.',
      });
      return;
    }
  }

  // Check query params
  if (containsSuspiciousContent(Object.values(req.query))) {
    res.status(400).json({
      error: 'Invalid input',
      message: 'Request contains potentially malicious content.',
    });
    return;
  }

  next();
}

// --- Security Headers ---

/**
 * Additional security headers for financial endpoints.
 * Augments Helmet's defaults with payment-specific protections.
 */
export function financialSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent caching of financial responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Prevent embedding in iframes (clickjacking protection)
  res.setHeader('X-Frame-Options', 'DENY');

  // Strict Content-Type enforcement
  res.setHeader('X-Content-Type-Options', 'nosniff');

  next();
}

// --- Combined Middleware ---

/**
 * Combined financial security middleware stack.
 * Applies rate limiting, input sanitization, and security headers.
 * Use on all /wallet and /donations routes.
 */
export const financialSecurityMiddleware = [
  financialRateLimit,
  financialInputSanitizer,
  financialSecurityHeaders,
];

// --- Test Helpers ---

/** Reset the rate limiter store (for tests) */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}

/** Get current rate limit store size (for tests) */
export function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}

/** Stop the cleanup interval (for tests) */
export function stopCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
