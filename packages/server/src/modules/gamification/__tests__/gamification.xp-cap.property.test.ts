import * as fc from 'fast-check';
import { GamificationService } from '../gamification.service';
import { AlertsService } from '../../alerts/alerts.service';

/**
 * Property 10: XP award correctness
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 *
 * For any sequence of donation actions on a given day, the total XP awarded
 * from donations does not exceed 200 XP for that user–cat pair.
 */

// --- Mock Prisma Client with stateful donation XP tracking ---
function createStatefulMockPrisma() {
  /** Accumulated donation XP for the current test run (simulates daily aggregate) */
  let accumulatedDonationXp = 0;

  const prisma = {
    user: {
      update: jest.fn().mockResolvedValue({}),
    },
    ownership: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 50, level: 4 }),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    userCatDiscovery: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'u1', catId: 'c1' }),
    },
    cat: {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1', name: 'Whiskers' }),
    },
    donationXpLog: {
      aggregate: jest.fn().mockImplementation(() => {
        return Promise.resolve({ _sum: { xpAwarded: accumulatedDonationXp } });
      }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        accumulatedDonationXp += data.xpAwarded;
        return Promise.resolve({});
      }),
    },
    /** Reset accumulated state between property runs */
    __reset() {
      accumulatedDonationXp = 0;
    },
    /** Get current accumulated XP (for assertions) */
    __getAccumulatedXp() {
      return accumulatedDonationXp;
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

describe('GamificationService — Donation XP Cap Property Tests', () => {
  let prisma: ReturnType<typeof createStatefulMockPrisma>;
  let alerts: jest.Mocked<AlertsService>;
  let service: GamificationService;

  beforeEach(() => {
    prisma = createStatefulMockPrisma();
    alerts = createMockAlerts();
    service = new GamificationService(prisma, alerts);
  });

  /**
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
   *
   * Property: For any sequence of donation amounts (each 1–50000 cents),
   * the total XP awarded across all donations in a single day never exceeds
   * the DAILY_DONATION_XP_CAP of 200 for a given user–cat pair.
   */
  it('total donation XP never exceeds 200 for any sequence of donations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate an array of 1–20 donation amounts in cents (100 cents = 1 XP)
        fc.array(fc.integer({ min: 100, max: 50000 }), { minLength: 1, maxLength: 20 }),
        async (donationAmounts: number[]) => {
          // Reset state for each property run
          prisma.__reset();

          let totalXpAwarded = 0;

          // Execute each donation sequentially (same user, same cat, same day)
          for (const amountCents of donationAmounts) {
            const result = await service.recordAction('u1', 'c1', 'donation', amountCents);
            totalXpAwarded += result.xpAwarded;

            // Each individual award must be non-negative
            expect(result.xpAwarded).toBeGreaterThanOrEqual(0);
          }

          // Core property: total XP from donations must never exceed the daily cap
          expect(totalXpAwarded).toBeLessThanOrEqual(200);

          // Secondary check: accumulated XP tracked in mock DB matches what was awarded
          expect(prisma.__getAccumulatedXp()).toBe(totalXpAwarded);
          expect(prisma.__getAccumulatedXp()).toBeLessThanOrEqual(200);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
   *
   * Property: For any single donation that would exceed the remaining cap,
   * the awarded XP is clamped so the cumulative total equals exactly the cap
   * (or less if the donation raw XP is smaller than remaining).
   */
  it('XP is correctly clamped when a donation would exceed the remaining cap', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Pre-existing XP already used today (0–200)
        fc.integer({ min: 0, max: 200 }),
        // New donation amount in cents
        fc.integer({ min: 100, max: 100000 }),
        async (preExistingXp: number, amountCents: number) => {
          // Reset and set pre-existing XP state
          prisma.__reset();
          // Simulate that some XP was already used today by calling __reset and manually setting
          // We need to adjust the aggregate mock to return preExistingXp
          prisma.donationXpLog.aggregate.mockImplementation(() => {
            return Promise.resolve({ _sum: { xpAwarded: preExistingXp } });
          });

          const result = await service.recordAction('u1', 'c1', 'donation', amountCents);

          const rawXp = Math.floor(amountCents / 100);
          const remainingCap = Math.max(0, 200 - preExistingXp);
          const expectedXp = Math.min(rawXp, remainingCap);

          // XP awarded matches the expected clamped value
          expect(result.xpAwarded).toBe(expectedXp);

          // Total (pre-existing + new) never exceeds 200
          expect(preExistingXp + result.xpAwarded).toBeLessThanOrEqual(200);
        },
      ),
      { numRuns: 30 },
    );
  });
});
