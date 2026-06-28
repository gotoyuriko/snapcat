import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../../../config';

// --- Prisma mock setup ---
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
  compare: jest.fn(),
}));

import bcrypt from 'bcrypt';
import { AuthService, TokenPair } from '../auth.service';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  // ─── Token Generation ───────────────────────────────────────────────────────

  describe('generateTokenPair (via login)', () => {
    const fakeUser = {
      id: 'user-123',
      email: 'cat@example.com',
      displayName: 'CatLover',
      passwordHash: '$2b$12$hashedpassword',
    };

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(fakeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
    });

    it('produces a valid JWT access token with userId and email', async () => {
      const tokens = await authService.login(fakeUser.email, 'password123');

      const decoded = jwt.verify(tokens.accessToken, config.jwtSecret) as any;
      expect(decoded.userId).toBe(fakeUser.id);
      expect(decoded.email).toBe(fakeUser.email);
    });

    it('access token expires in exactly 15 minutes (900 seconds)', async () => {
      const tokens = await authService.login(fakeUser.email, 'password123');

      const decoded = jwt.decode(tokens.accessToken) as any;
      const expiryDuration = decoded.exp - decoded.iat;
      expect(expiryDuration).toBe(900);
    });

    it('produces an opaque refresh token (not a JWT)', async () => {
      const tokens = await authService.login(fakeUser.email, 'password123');

      // Refresh token should be a hex string (80 chars = 40 random bytes as hex)
      expect(tokens.refreshToken).toMatch(/^[a-f0-9]{80}$/);

      // It should NOT be decodable as a JWT
      expect(() => jwt.decode(tokens.refreshToken)).not.toThrow();
      expect(jwt.decode(tokens.refreshToken)).toBeNull();
    });

    it('stores the refresh token hash in the database', async () => {
      const tokens = await authService.login(fakeUser.email, 'password123');

      const expectedHash = crypto
        .createHash('sha256')
        .update(tokens.refreshToken)
        .digest('hex');

      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokenHash: expectedHash,
          userId: fakeUser.id,
        }),
      });
    });

    it('refresh token DB record has 7-day expiry', async () => {
      const before = Date.now();
      await authService.login(fakeUser.email, 'password123');
      const after = Date.now();

      const createCall = mockPrisma.refreshToken.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs);
    });
  });

  // ─── Refresh Rotation ───────────────────────────────────────────────────────

  describe('refresh()', () => {
    const fakeUser = {
      id: 'user-456',
      email: 'meow@example.com',
      displayName: 'MeowUser',
      passwordHash: '$2b$12$hash',
    };

    it('revokes old token and issues a new pair', async () => {
      const oldRefreshToken = crypto.randomBytes(40).toString('hex');
      const oldTokenHash = crypto
        .createHash('sha256')
        .update(oldRefreshToken)
        .digest('hex');

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        tokenHash: oldTokenHash,
        userId: fakeUser.id,
        revoked: false,
        expiresAt: new Date(Date.now() + 86400000), // expires tomorrow
      });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(fakeUser);
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' });

      const newTokens = await authService.refresh(oldRefreshToken);

      // Old token was revoked
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-old' },
        data: { revoked: true },
      });

      // New pair was issued
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.refreshToken).not.toBe(oldRefreshToken);

      // New access token is valid
      const decoded = jwt.verify(newTokens.accessToken, config.jwtSecret) as any;
      expect(decoded.userId).toBe(fakeUser.id);
      expect(decoded.email).toBe(fakeUser.email);
    });

    it('rejects a revoked refresh token with 401', async () => {
      const revokedToken = crypto.randomBytes(40).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(revokedToken)
        .digest('hex');

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-revoked',
        tokenHash,
        userId: fakeUser.id,
        revoked: true, // already revoked
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(authService.refresh(revokedToken)).rejects.toMatchObject({
        message: 'Invalid refresh token',
        status: 401,
      });
    });

    it('rejects an expired refresh token with 401', async () => {
      const expiredToken = crypto.randomBytes(40).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(expiredToken)
        .digest('hex');

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-expired',
        tokenHash,
        userId: fakeUser.id,
        revoked: false,
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      });

      await expect(authService.refresh(expiredToken)).rejects.toMatchObject({
        message: 'Invalid refresh token',
        status: 401,
      });
    });

    it('rejects a non-existent refresh token with 401', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        authService.refresh('nonexistent-token'),
      ).rejects.toMatchObject({
        message: 'Invalid refresh token',
        status: 401,
      });
    });
  });

  // ─── Expiry Edge Cases ──────────────────────────────────────────────────────

  describe('verifyAccessToken()', () => {
    it('rejects an expired access token (zero tolerance)', () => {
      // Sign a token that already expired 1 second ago
      const expiredToken = jwt.sign(
        { userId: 'user-789', email: 'expired@example.com' },
        config.jwtSecret,
        { expiresIn: -1 }, // already expired
      );

      expect(() => authService.verifyAccessToken(expiredToken)).toThrow();

      try {
        authService.verifyAccessToken(expiredToken);
      } catch (err: any) {
        expect(err.status).toBe(401);
        expect(err.message).toBe('Invalid or expired token');
      }
    });

    it('accepts a token that is still within 15-minute window', () => {
      const validToken = jwt.sign(
        { userId: 'user-789', email: 'valid@example.com' },
        config.jwtSecret,
        { expiresIn: 900 },
      );

      const payload = authService.verifyAccessToken(validToken);
      expect(payload.userId).toBe('user-789');
      expect(payload.email).toBe('valid@example.com');
    });

    it('rejects a token with an invalid signature', () => {
      const badToken = jwt.sign(
        { userId: 'user-789', email: 'bad@example.com' },
        'wrong-secret',
        { expiresIn: 900 },
      );

      expect(() => authService.verifyAccessToken(badToken)).toThrow();

      try {
        authService.verifyAccessToken(badToken);
      } catch (err: any) {
        expect(err.status).toBe(401);
      }
    });

    it('rejects expired token even if it expired just 1 second ago (zero tolerance)', () => {
      // Manually craft a token that expired exactly 1 second ago
      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        { userId: 'user-789', email: 'edge@example.com', iat: now - 901, exp: now - 1 },
        config.jwtSecret,
      );

      expect(() => authService.verifyAccessToken(token)).toThrow();
    });
  });

  // ─── Login with wrong password ─────────────────────────────────────────────

  describe('login()', () => {
    it('returns 401 when password is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-111',
        email: 'user@example.com',
        displayName: 'User',
        passwordHash: '$2b$12$somehash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login('user@example.com', 'wrongpassword'),
      ).rejects.toMatchObject({
        message: 'Invalid credentials',
        status: 401,
      });
    });

    it('returns 401 when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login('nonexistent@example.com', 'password'),
      ).rejects.toMatchObject({
        message: 'Invalid credentials',
        status: 401,
      });
    });
  });

  // ─── Register with duplicate email ─────────────────────────────────────────

  describe('register()', () => {
    it('returns 409 when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'taken@example.com',
        displayName: 'ExistingUser',
        passwordHash: '$2b$12$hash',
      });

      await expect(
        authService.register('taken@example.com', 'NewUser', 'password123'),
      ).rejects.toMatchObject({
        message: 'Email already in use',
        status: 409,
      });
    });
  });

  // ─── Logout ─────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('revokes the refresh token', async () => {
      const refreshToken = crypto.randomBytes(40).toString('hex');
      const expectedHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await authService.logout(refreshToken);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expectedHash },
        data: { revoked: true },
      });
    });
  });
});
