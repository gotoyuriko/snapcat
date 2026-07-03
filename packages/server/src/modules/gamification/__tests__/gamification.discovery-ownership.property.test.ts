import * as fc from 'fast-check';
import { GamificationService } from '../gamification.service';
import { AlertsService } from '../../alerts/alerts.service';
import { GamificationAction } from '@codingkitty/shared';

/**
 * Property 5: Discovery–Ownership referential integrity
 * **Validates: Requirements 6.10, 14.3**
 *
 * For any Ownership record in the database, a corresponding UserCatDiscovery
 * record with the same (userId, catId) pair SHALL also exist.
 * An Ownership record can only be created if a UserCatDiscovery record exists.
 * A UserCatDiscovery record MAY exist without a corresponding Ownership record.
 */

// --- Arbitrary for non-donation GamificationActions ---
const nonDonationActionArb: fc.Arbitrary<Exclude<GamificationAction, 'donation'>> = fc.constantFrom(
  'discover_new',
  'scan',
  'medical_reimbursed',
);

const actionArb: fc.Arbitrary<GamificationAction> = fc.constantFrom(
  'discover_new',
  'scan',
  'donation',
  'medical_reimbursed',
);

// --- Mock Prisma with stateful discovery/ownership tracking ---
function createStatefulMockPrisma(hasDiscovery: boolean) {
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
      findUnique: jest.fn().mockImplementation(() => {
        // Return discovery record if hasDiscovery is true, null otherwise
        if (hasDiscovery) {
          return Promise.resolve({ userId: 'u1', catId: 'c1', discoveredAt: new Date() });
        }
        return Promise.resolve(null);
      }),
    },
    cat: {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1', name: 'Whiskers' }),
    },
    donationXpLog: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { xpAwarded: 0 } }),
      create: jest.fn().mockResolvedValue({}),
    },
    // Daily once-per-scan gate disabled (count always 0) — covered by unit tests
    scanXpLog: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    /** Check if ownership was created */
    __hasOwnership() {
      return ownershipRecord !== null;
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

describe('GamificationService — Discovery–Ownership Referential Integrity Property Tests', () => {
  /**
   * **Validates: Requirements 6.10, 14.3**
   *
   * Property: For any action sequence on a user–cat pair where NO UserCatDiscovery
   * record exists, NO Ownership record is ever created. This proves the invariant:
   * Ownership implies Discovery.
   */
  it('no Ownership record is created when UserCatDiscovery does not exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of 1–10 actions (any type)
        fc.array(
          fc.record({
            action: actionArb,
            amountCents: fc.integer({ min: 100, max: 50000 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (actions) => {
          // Set up mock WITHOUT discovery record
          const prisma = createStatefulMockPrisma(false);
          const alerts = createMockAlerts();
          const service = new GamificationService(prisma, alerts);

          // Execute each action sequentially
          for (const { action, amountCents } of actions) {
            await service.recordAction(
              'u1',
              'c1',
              action,
              action === 'donation' ? amountCents : undefined,
            );
          }

          // Core property: Ownership must never be created without Discovery
          expect(prisma.__hasOwnership()).toBe(false);
          expect(prisma.ownership.create).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.10, 14.3**
   *
   * Property: For any action sequence on a user–cat pair where a UserCatDiscovery
   * record DOES exist, the service MAY create an Ownership record. When it does,
   * the discovery record still exists (is not deleted or modified). This proves:
   * - Ownership can only exist alongside Discovery
   * - Discovery is independent and not affected by Ownership creation
   */
  it('Ownership may be created only when UserCatDiscovery exists, and discovery remains intact', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of 1–10 non-donation actions
        fc.array(nonDonationActionArb, { minLength: 1, maxLength: 10 }),
        async (actions) => {
          // Set up mock WITH discovery record
          const prisma = createStatefulMockPrisma(true);
          const alerts = createMockAlerts();
          const service = new GamificationService(prisma, alerts);

          // Execute each action sequentially (non-donation actions don't need amountCents)
          for (const action of actions) {
            await service.recordAction('u1', 'c1', action);
          }

          // When discovery exists, ownership creation is allowed
          // After at least one non-donation action, ownership should be created
          expect(prisma.__hasOwnership()).toBe(true);

          // Discovery record lookup should have been called (verifying referential check)
          expect(prisma.userCatDiscovery.findUnique).toHaveBeenCalled();

          // Discovery mock still returns the record (not deleted/modified)
          const discoveryStillExists = await prisma.userCatDiscovery.findUnique({
            where: { userId_catId: { userId: 'u1', catId: 'c1' } },
          });
          expect(discoveryStillExists).not.toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });
});
