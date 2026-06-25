import { Request, Response, NextFunction } from 'express';

/**
 * TODO: Implement ownership gate middleware.
 * - Check if the authenticated user has the required ownership level for a cat
 * - Used to protect cat-specific actions (feeding, medical requests, etc.)
 * - Should check UserCatDiscovery and Ownership tables
 * - Return 403 if user lacks required ownership level
 */
export function ownershipGate(requiredLevel: string) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // TODO: Query ownership and verify level
    next();
  };
}
