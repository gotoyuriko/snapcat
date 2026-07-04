/**
 * Property 11: Notification rate limit (with milestone bypass)
 *
 * **Validates: Requirements 12.5**
 *
 * For any user and any simulated burst of notification events in a 1-hour window,
 * the total non-milestone notifications delivered does not exceed 10;
 * ownership milestone notifications bypass the rate limit.
 *
 * We test the actual AlertsService class with mocked Prisma and PushProvider,
 * simulating database behavior in memory to validate the rate-limit property.
 */

import * as fc from 'fast-check';

// --- In-memory state ---
let notificationLogs: Array<{
  id: string;
  userId: string;
  title: string;
  body: string;
  isMilestone: boolean;
  sentAt: Date;
}>;

let deliveredNotifications: Array<{
  userId: string;
  title: string;
  body: string;
  isMilestone: boolean;
}>;

// --- Mock PrismaClient ---
const mockPrismaInstance = {
  notificationLog: {
    count: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaInstance),
}));

// Import after mocks
import { AlertsService, PushProvider } from '../../modules/alerts/alerts.service';

// --- Mock PushProvider ---
class MockPushProvider implements PushProvider {
  async send(userId: string, title: string, body: string, _data?: Record<string, string>): Promise<void> {
    // Track delivery — isMilestone is determined by caller context, tracked via logs
    deliveredNotifications.push({ userId, title, body, isMilestone: false });
  }
}

// --- Notification event type ---
type NotificationEvent = {
  isMilestone: boolean;
  title: string;
  body: string;
  sentAtOffset: number; // Offset in ms from window start (0 to 3600000)
};

// --- Setup mock behaviors ---
function setupMocks() {
  // notificationLog.count: count non-milestone entries in the window
  mockPrismaInstance.notificationLog.count.mockImplementation((args: any) => {
    const userId = args?.where?.userId;
    const isMilestone = args?.where?.isMilestone;
    const sentAtGte = args?.where?.sentAt?.gte;

    const count = notificationLogs.filter(
      (log) =>
        log.userId === userId &&
        log.isMilestone === isMilestone &&
        log.sentAt >= sentAtGte,
    ).length;

    return Promise.resolve(count);
  });

  // notificationLog.create: push entry to in-memory array
  mockPrismaInstance.notificationLog.create.mockImplementation((args: any) => {
    const entry = {
      id: `notif-${notificationLogs.length + 1}`,
      userId: args.data.userId,
      title: args.data.title,
      body: args.data.body,
      isMilestone: args.data.isMilestone,
      sentAt: args.data.sentAt,
    };
    notificationLogs.push(entry);
    return Promise.resolve(entry);
  });
}

// --- Arbitraries ---

const notificationEventArb: fc.Arbitrary<NotificationEvent> = fc.record({
  isMilestone: fc.boolean(),
  title: fc.string({ minLength: 1, maxLength: 20 }),
  body: fc.string({ minLength: 1, maxLength: 50 }),
  // Offset within 1-hour window (0 to 3,600,000 ms)
  sentAtOffset: fc.integer({ min: 0, max: 3_600_000 }),
});

// --- Property Test ---

describe('Notification Rate Limit (with Milestone Bypass) — Property Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 11: Notification rate limit (with milestone bypass)
   *
   * **Validates: Requirements 12.5**
   *
   * For any user and any simulated burst of notification events in a 1-hour window:
   * (a) Total non-milestone notifications actually delivered does not exceed 10
   * (b) ALL milestone notifications are delivered regardless of rate limit
   */
  it('non-milestone notifications do not exceed 10 per user per hour, and milestone notifications always bypass the limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Burst of 5 to 30 notification events
        fc.array(notificationEventArb, { minLength: 5, maxLength: 30 }),
        async (events) => {
          const userId = 'test-user-rate-limit';

          // Reset in-memory state
          notificationLogs = [];
          deliveredNotifications = [];

          // Setup mocks
          setupMocks();

          // Create the service with mock push provider
          const mockPushProvider = new MockPushProvider();
          const alertsService = new AlertsService(undefined, mockPushProvider);

          // Sort events by offset to simulate chronological order
          const sortedEvents = [...events].sort((a, b) => a.sentAtOffset - b.sentAtOffset);

          // Track milestone deliveries separately for verification
          let expectedMilestoneCount = 0;

          // Send all notifications
          for (const event of sortedEvents) {
            if (event.isMilestone) {
              expectedMilestoneCount++;
              await alertsService.notifyMilestone(userId, event.title, event.body);
            } else {
              await alertsService.notify(userId, event.title, event.body);
            }
          }

          // Count actual deliveries by type
          // Non-milestone deliveries are those that correspond to non-milestone log entries
          const nonMilestoneDelivered = notificationLogs.filter(
            (log) => log.userId === userId && !log.isMilestone,
          ).length;

          const milestoneDelivered = notificationLogs.filter(
            (log) => log.userId === userId && log.isMilestone,
          ).length;

          // INVARIANT (a): Non-milestone notifications delivered must not exceed 10
          expect(nonMilestoneDelivered).toBeLessThanOrEqual(10);

          // INVARIANT (b): ALL milestone notifications must be delivered
          expect(milestoneDelivered).toBe(expectedMilestoneCount);
        },
      ),
      { numRuns: 30 },
    );
  });
});
