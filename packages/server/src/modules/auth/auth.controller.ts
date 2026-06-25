import { Request, Response } from 'express';

/**
 * TODO: Implement AuthController
 * - Handle HTTP request/response for auth endpoints
 * - Validate request bodies with zod
 * - Delegate to AuthService
 */

export class AuthController {
  async register(_req: Request, res: Response): Promise<void> {
    // TODO: Validate body, call service, return token
    res.status(501).json({ error: 'Not implemented' });
  }

  async login(_req: Request, res: Response): Promise<void> {
    // TODO: Validate body, call service, return token
    res.status(501).json({ error: 'Not implemented' });
  }
}
