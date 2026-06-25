/**
 * TODO: Implement AuthService
 * - Hash passwords with bcrypt
 * - Create users in database via Prisma
 * - Generate and verify JWT tokens
 * - Handle login validation
 */

export class AuthService {
  async register(_email: string, _displayName: string, _password: string): Promise<{ token: string; userId: string }> {
    // TODO: Hash password, create user, generate JWT
    throw new Error('Not implemented');
  }

  async login(_email: string, _password: string): Promise<{ token: string }> {
    // TODO: Find user, compare password hash, generate JWT
    throw new Error('Not implemented');
  }

  async verifyToken(_token: string): Promise<{ userId: string; email: string }> {
    // TODO: Verify JWT and return decoded payload
    throw new Error('Not implemented');
  }
}
