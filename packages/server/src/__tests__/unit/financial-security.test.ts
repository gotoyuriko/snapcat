/**
 * Unit tests for financial security middleware.
 *
 * Tests:
 * - Rate limiting on financial routes (sliding window, per-IP)
 * - Input sanitization (rejects XSS, injection, prototype pollution)
 * - Security headers applied to responses
 */

import { Request, Response, NextFunction } from 'express';
import {
  financialRateLimit,
  financialInputSanitizer,
  financialSecurityHeaders,
  resetRateLimitStore,
  stopCleanup,
} from '../../middleware/financialSecurity';

// Helper to create mock Express objects
function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: '127.0.0.1',
    headers: {},
    method: 'GET',
    body: {},
    query: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & { statusCode: number; jsonBody: unknown; headersSent: Record<string, string> } {
  const res = {
    statusCode: 200,
    jsonBody: null as unknown,
    headersSent: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.jsonBody = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headersSent[name] = value;
      return res;
    },
  } as unknown as Response & { statusCode: number; jsonBody: unknown; headersSent: Record<string, string> };
  return res;
}

describe('Financial Security Middleware', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  afterAll(() => {
    stopCleanup();
  });

  describe('financialRateLimit', () => {
    it('should allow requests under the rate limit', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialRateLimit(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('should block requests that exceed the rate limit (30 per 15 min)', () => {
      const req = createMockReq({ ip: '192.168.1.1' });
      const next = jest.fn() as NextFunction;

      // Send 30 requests (should all pass)
      for (let i = 0; i < 30; i++) {
        const res = createMockRes();
        financialRateLimit(req, res, next);
      }
      expect(next).toHaveBeenCalledTimes(30);

      // 31st request should be rate limited
      const res = createMockRes();
      financialRateLimit(req, res, next);
      expect(res.statusCode).toBe(429);
      expect(res.jsonBody).toEqual(expect.objectContaining({ error: 'Too many requests' }));
      expect(next).toHaveBeenCalledTimes(30); // Not called again
    });

    it('should rate limit per IP independently', () => {
      const req1 = createMockReq({ ip: '10.0.0.1' });
      const req2 = createMockReq({ ip: '10.0.0.2' });
      const next = jest.fn() as NextFunction;

      // Exhaust IP1's limit
      for (let i = 0; i < 30; i++) {
        const res = createMockRes();
        financialRateLimit(req1, res, next);
      }

      // IP2 should still be allowed
      const res = createMockRes();
      financialRateLimit(req2, res, next);
      expect(next).toHaveBeenCalledTimes(31);
      expect(res.statusCode).toBe(200);
    });

    it('should use x-forwarded-for header if present', () => {
      const req = createMockReq({
        headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' },
        ip: '127.0.0.1',
      });
      const next = jest.fn() as NextFunction;

      // First request should pass
      const res = createMockRes();
      financialRateLimit(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('financialInputSanitizer', () => {
    it('should allow valid POST request bodies', () => {
      const req = createMockReq({
        method: 'POST',
        body: { amountCents: 5000, catId: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialInputSanitizer(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('should reject bodies containing <script> tags', () => {
      const req = createMockReq({
        method: 'POST',
        body: { name: '<script>alert("xss")</script>' },
      });
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialInputSanitizer(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual(expect.objectContaining({ error: 'Invalid input' }));
    });

    it('should reject bodies with prototype pollution attempts', () => {
      // Simulate JSON.parse output that Express would produce from malicious JSON
      const body: Record<string, unknown> = {};
      Object.defineProperty(body, '__proto__', {
        value: { isAdmin: true },
        enumerable: true,
        configurable: true,
        writable: true,
      });
      const req = createMockReq({
        method: 'POST',
        body,
      });
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialInputSanitizer(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
    });

    it('should reject bodies with template injection', () => {
      const req = createMockReq({
        method: 'POST',
        body: { input: '${7*7}' },
      });
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialInputSanitizer(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
    });

    it('should reject suspicious query parameters', () => {
      const req = createMockReq({
        method: 'GET',
        query: { search: '<script>alert(1)</script>' },
      });
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialInputSanitizer(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
    });

    it('should allow GET requests without a body', () => {
      const req = createMockReq({ method: 'GET', query: {} });
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialInputSanitizer(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject nested malicious content in arrays', () => {
      const req = createMockReq({
        method: 'POST',
        body: { items: [{ name: 'valid' }, { name: 'javascript:void(0)' }] },
      });
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialInputSanitizer(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
    });
  });

  describe('financialSecurityHeaders', () => {
    it('should set no-cache headers', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialSecurityHeaders(req, res, next);

      expect(res.headersSent['Cache-Control']).toBe(
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      expect(res.headersSent['Pragma']).toBe('no-cache');
      expect(res.headersSent['Expires']).toBe('0');
      expect(next).toHaveBeenCalled();
    });

    it('should set X-Frame-Options to DENY', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialSecurityHeaders(req, res, next);

      expect(res.headersSent['X-Frame-Options']).toBe('DENY');
    });

    it('should set X-Content-Type-Options', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn() as NextFunction;

      financialSecurityHeaders(req, res, next);

      expect(res.headersSent['X-Content-Type-Options']).toBe('nosniff');
    });
  });
});
