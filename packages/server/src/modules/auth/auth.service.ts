import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { config } from '../../config';

const prisma = new PrismaClient();

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export class AuthService {
  /**
   * Register a new user. Returns access + refresh token pair.
   */
  async register(
    email: string,
    displayName: string,
    password: string,
  ): Promise<TokenPair & { userId: string }> {
    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const err = new Error('Email already in use');
      (err as any).status = 409;
      throw err;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: { email, displayName, passwordHash },
    });

    // Generate tokens
    const tokens = await this.generateTokenPair(user.id, user.email);

    return { ...tokens, userId: user.id };
  }

  /**
   * Authenticate user with email/password. Returns access + refresh token pair.
   */
  async login(email: string, password: string): Promise<TokenPair> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const err = new Error('Invalid credentials');
      (err as any).status = 401;
      throw err;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const err = new Error('Invalid credentials');
      (err as any).status = 401;
      throw err;
    }

    return this.generateTokenPair(user.id, user.email);
  }

  /**
   * Refresh tokens. Validates the old refresh token, rotates it, and issues new pair.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
      const err = new Error('Invalid refresh token');
      (err as any).status = 401;
      throw err;
    }

    // Revoke the old token (rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    // Get the user to generate a new pair
    const user = await prisma.user.findUnique({ where: { id: storedToken.userId } });
    if (!user) {
      const err = new Error('User not found');
      (err as any).status = 401;
      throw err;
    }

    return this.generateTokenPair(user.id, user.email);
  }

  /**
   * Logout: revoke the given refresh token.
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    // Revoke the token if it exists; if it doesn't exist, that's fine
    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }

  /**
   * Verify an access token. Returns the decoded payload.
   * Enforces expiry with zero clock tolerance.
   */
  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        clockTolerance: 0,
      }) as jwt.JwtPayload & AccessTokenPayload;

      return { userId: decoded.userId, email: decoded.email };
    } catch {
      const err = new Error('Invalid or expired token');
      (err as any).status = 401;
      throw err;
    }
  }

  /**
   * Generate an access + refresh token pair and persist the refresh token.
   */
  private async generateTokenPair(userId: string, email: string): Promise<TokenPair> {
    // Access token — exactly 15 minutes, no tolerance
    const accessToken = jwt.sign(
      { userId, email } as AccessTokenPayload,
      config.jwtSecret,
      { expiresIn: config.jwtAccessExpiresInSeconds },
    );

    // Refresh token — random opaque string, stored hashed in DB
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + config.jwtRefreshExpiresInSeconds * 1000);

    await prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * SHA-256 hash a refresh token for secure storage.
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
