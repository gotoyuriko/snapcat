import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Ownership gate middleware.
 * Checks if the authenticated user has the required ownership level for a cat.
 * The catId is resolved from req.params.catId or req.body.catId.
 * Returns 403 if user lacks the required ownership level.
 *
 * @param requiredLevel - Minimum numeric ownership level required (e.g., 1 for Lvl1+)
 */
export function ownershipGate(requiredLevel: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const catId = req.params.catId || req.body.catId;

    if (!catId) {
      res.status(400).json({ error: 'catId is required' });
      return;
    }

    try {
      const ownership = await prisma.ownership.findUnique({
        where: {
          userId_catId: { userId, catId },
        },
      });

      // Requirement 16.2: a revoked owner keeps their historical level but
      // loses all owner privileges — treat as non-owner until restored.
      if (!ownership || ownership.level < requiredLevel || ownership.revokedAt != null) {
        res.status(403).json({
          error: ownership?.revokedAt
            ? 'Ownership revoked due to inactivity'
            : 'Insufficient ownership level',
          required: requiredLevel,
          current: ownership && ownership.revokedAt == null ? ownership.level : null,
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
