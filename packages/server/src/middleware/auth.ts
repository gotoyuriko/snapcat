import { Request, Response, NextFunction } from 'express';

/**
 * TODO: Implement JWT authentication middleware.
 * - Extract Bearer token from Authorization header
 * - Verify token using jsonwebtoken
 * - Attach decoded user payload to req.user
 * - Return 401 if token is missing or invalid
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // TODO: Implement JWT verification
  next();
}
