import * as fc from 'fast-check';
import { GamificationService, calculateLevel } from '../gamification.service';
import { AlertsService } from '../../alerts/alerts.service';

/**
 * Property 3: Ownership promotion monotonicity (and demotion correctness)
 * **Validates: Requirements 6.5, 6.8**
 *
 * 1. For any sequence of positive XP increments, the ownership level never decreases (monotonicity).
 * 2. For any cumulative XP value, calculateLevel(xp) returns the correct level per thresholds.
 * 3. Level caps at 10 for any XP value (even extremely large ones beyond 226).
 * 4. If XP decreases below a threshold, the level correctly reflects the lower XP (demotion).
 */

// Requirement 6.6 thresholds: Lvl1 = 1, then each increment grows by 5.
const LEVEL_THRESHOLDS: readonly number[] = [
  0,    // Lvl0
  1,    // Lvl1
  6,    // Lvl2
  16,   // Lvl3
  31,   // Lvl4
  51,   // Lvl5
  76,   // Lvl6
  106,  // Lvl7
  141,  // Lvl8
  181,  // Lvl9
  226,  // Lvl10
];

// --- Mock Prisma with stateful ownership XP tracking ---
function createStatefulMockPrisma() {
  let ownershipRecord: { userId: string; catId: string; xp: number; level: number } | null = null;

  const prisma = {
    user: {
      update: jest.fn().mockResolvedValue({}),
    },
    ownership: {
      findUnique: jest.fn().mockImplementation(() => {
        return Promise.resolve(ownershipRecord);
      }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        ownershipRecord = {
          userId: data.userId,
          catId: data.catId,
          xp: data.xp,
          level: data.level,
        };
        return Promise.resolve(ownershipRecord);
      }),
      update: jest.fn().mockImplementation(({ data }: any) => {
        if (ownershipRecord) {
          ownershipRecord = {
            ...ownershipRecord,
            xp: data.xp ?? ownershipRecord.xp,
            level: data.level ?? ownershipRecord.level,
          };
        }
        return Promise.resolve(ownershipRecord);
      }),
    },
    userCatDiscovery: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'u1', catId: 'c1', discoveredAt: new Date() }),
    },
    cat: {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1', name: 'Whiskers' }),
    },
    donationXpLog: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { xpAwarded: 0 } }),
      create: jest.fn().mockResolvedValue({}),
    },
    // Daily once-per-scan gate disabled here (count always 0) so every scan
    // awards XP — the gate itself is covered by the service unit tests.
    scanXpLog: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    __getOwnership() {
      return ownershipRecord;
    },
    __reset() {
      ownershipRecord = null;
    },
  } as any;

  return prisma;
}

// --- Mock Alerts Service ---
function createMockAlerts(): jest.Mocked<AlertsService> {
  return {
    notify: jest.fn().mockResolvedValue(undefined),
    notifyCatFollowers: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('GamificationService — Ownership Promotion Monotonicity Property Tests', () => {
  /**
   * **Validates: Requirements 6.5, 6.8**
   *
   * Property: For any sequence of positive XP increments (scan actions),
   * the ownership level never decreases. Level is monotonically non-decreasing
   * when XP only increases.
   */
  it('ownership level never decreases when XP only increases (monotonicity)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of 2–15 scan actions (each awards 3 XP)
        fc.integer({ min: 2, max: 15 }),
        async (numScans: number) => {
          const prisma = createStatefulMockPrisma();
          const alerts = createMockAlerts();
          const service = new GamificationService(prisma, alerts);

          let previousLevel = 0;

          for (let i = 0; i < numScans; i++) {
            const result = await service.recordAction('u1', 'c1', 'scan');
            const currentLevel = result.newLevel;

            // Core property: level must never decrease
            expect(currentLevel).toBeGreaterThanOrEqual(previousLevel);
            previousLevel = currentLevel;
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * **Validates: Requirements 6.5, 6.8**
   *
   * Property: For any cumulative XP value, calculateLevel(xp) returns
   * the highest level index i where LEVEL_THRESHOLDS[i] <= xp.
   */
  it('calculateLevel returns the correct level for any XP value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        (xp: number) => {
          const level = calculateLevel(xp);

          // Find expected level: highest index where threshold <= xp
          let expectedLevel = 0;
          for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
            if (xp >= LEVEL_THRESHOLDS[i]) {
              expectedLevel = i;
              break;
            }
          }

          expect(level).toBe(expectedLevel);

          // Verify threshold relationship:
          // xp >= threshold for current level
          expect(xp).toBeGreaterThanOrEqual(LEVEL_THRESHOLDS[level]);
          // xp < threshold for next level (if not max)
          if (level < LEVEL_THRESHOLDS.length - 1) {
            expect(xp).toBeLessThan(LEVEL_THRESHOLDS[level + 1]);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * Property: For any XP value (even extremely large ones beyond 226),
   * the level never exceeds 10 (max level). XP accumulates beyond Lvl10
   * but does not unlock additional levels.
   */
  it('level never exceeds 10 for any XP value (cap at max level)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        (xp: number) => {
          const level = calculateLevel(xp);

          // Core property: level is always <= 10
          expect(level).toBeLessThanOrEqual(10);
          // Level is always >= 0
          expect(level).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 6.5**
   *
   * Property: If XP decreases below a level's threshold, calculateLevel
   * correctly reflects the lower level (demotion correctness).
   * For any XP that puts the user at level L, reducing XP below
   * LEVEL_THRESHOLDS[L] results in a level < L.
   */
  it('level correctly demotes when XP drops below current threshold', () => {
    fc.assert(
      fc.property(
        // Generate a level between 1 and 10 and an XP drop
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 500 }),
        (level: number, drop: number) => {
          // Start at exactly the threshold for this level
          const thresholdXp = LEVEL_THRESHOLDS[level];
          const startLevel = calculateLevel(thresholdXp);
          expect(startLevel).toBe(level);

          // Drop XP below the threshold
          const reducedXp = Math.max(0, thresholdXp - drop);
          const newLevel = calculateLevel(reducedXp);

          if (reducedXp < LEVEL_THRESHOLDS[level]) {
            // Level must decrease when XP is below the current level's threshold
            expect(newLevel).toBeLessThan(level);
          }

          // The new level must still be valid for the reduced XP
          expect(reducedXp).toBeGreaterThanOrEqual(LEVEL_THRESHOLDS[newLevel]);
          if (newLevel < LEVEL_THRESHOLDS.length - 1) {
            expect(reducedXp).toBeLessThan(LEVEL_THRESHOLDS[newLevel + 1]);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 6.5, 6.8**
   *
   * Integration property: For any sequence of positive XP awards via the service,
   * the ownership level tracked in the DB monotonically increases alongside cumulative XP.
   */
  it('ownership level via service monotonically increases with cumulative XP (integration)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of 1–10 positive XP increments (via different actions)
        fc.array(
          fc.record({
            action: fc.constantFrom('scan' as const, 'discover_new' as const, 'medical_reimbursed' as const),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (actions) => {
          const prisma = createStatefulMockPrisma();
          const alerts = createMockAlerts();
          const service = new GamificationService(prisma, alerts);

          let previousLevel = 0;

          for (const { action } of actions) {
            const result = await service.recordAction('u1', 'c1', action);

            // Level must never decrease when XP only increases
            expect(result.newLevel).toBeGreaterThanOrEqual(previousLevel);
            previousLevel = result.newLevel;
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
