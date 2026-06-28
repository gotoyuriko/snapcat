import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * Staff role guard middleware.
 * Must be used AFTER authMiddleware — it re-verifies the JWT and checks that
 * the `role` claim equals 'staff'. Returns 403 if the claim is missing or not 'staff'.
 *
 * Backward compatibility: tokens without a `role` field are treated as non-staff.
 */
export function staffGuard(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      clockTolerance: 0,
    }) as jwt.JwtPayload & { role?: string };

    if (decoded.role !== 'staff') {
      res.status(403).json({ error: 'Staff access required' });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
