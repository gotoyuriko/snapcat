/**
 * Auth Module
 * Handles user registration, login, and JWT token management.
 */

export interface AuthModule {
  /** Register a new user with email and password */
  register(email: string, displayName: string, password: string): Promise<{ token: string; userId: string }>;
  /** Authenticate user and return JWT */
  login(email: string, password: string): Promise<{ token: string }>;
  /** Verify a JWT token and return the decoded payload */
  verifyToken(token: string): Promise<{ userId: string; email: string }>;
}

export { AuthService } from './auth.service';
export { AuthController } from './auth.controller';
export { authRoutes } from './auth.routes';
