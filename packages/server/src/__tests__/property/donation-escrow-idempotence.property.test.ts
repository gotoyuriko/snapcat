/**
 * Property 6: Temporal workflow idempotence (Donation Escrow)
 *
 * **Validates: Requirements 10.6, 14.4**
 *
 * For any DonationEscrowWorkflow execution, re-running the workflow
 * with the same workflowId (donationId) and inputs produces the same
 * XP award and no duplicate wallet deduction.
 *
 * This validates that the workflow is deterministic and idempotent:
 * identical inputs → identical activity invocations with no duplicates.
 */

import * as fc from 'fast-check';

// --- Activity mocks ---
const mockReleaseToCatPool = jest.fn();
const mockAwardDonationXP = jest.fn();
const mockNotifyOwners = jest.fn();

// --- Temporal SDK mock ---
jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    releaseToCatPool: mockReleaseToCatPool,
    awardDonationXP: mockAwardDonationXP,
    notifyOwners: mockNotifyOwners,
  }),
  sleep: async (_duration: string) => {},
}));

// Import after mocks are set up
import { donationEscrowWorkflow } from '../../workflows/donation-escrow.workflow';

// --- Arbitraries ---
const idArb = fc.stringMatching(/^[a-z0-9-]{8,36}$/);
const amountArb = fc.integer({ min: 1, max: 100000 });

// --- Property Test ---

describe('Donation Escrow Workflow — Idempotence Property Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReleaseToCatPool.mockResolvedValue(undefined);
    mockAwardDonationXP.mockResolvedValue(undefined);
    mockNotifyOwners.mockResolvedValue(undefined);
  });

  /**
   * Property 6: Temporal workflow idempotence (donation)
   *
   * **Validates: Requirements 10.6, 14.4**
   *
   * Re-running donationEscrowWorkflow with the same workflowId results
   * in the same XP award and no duplicate wallet deduction.
   */
  it('re-running workflow with same inputs produces identical activity invocations with no duplicates', async () => {
    await fc.assert(
      fc.asyncProperty(
        idArb,
        idArb,
        idArb,
        amountArb,
        async (donationId, donorId, catId, amountCents) => {
          // --- First run ---
          jest.clearAllMocks();
          mockReleaseToCatPool.mockResolvedValue(undefined);
          mockAwardDonationXP.mockResolvedValue(undefined);
          mockNotifyOwners.mockResolvedValue(undefined);

          await donationEscrowWorkflow(donationId, donorId, catId, amountCents);

          const run1 = {
            releaseCalls: mockReleaseToCatPool.mock.calls.map(
              (c: any[]) => [c[0], c[1], c[2]] as [string, string, number],
            ),
            xpCalls: mockAwardDonationXP.mock.calls.map(
              (c: any[]) => [c[0], c[1], c[2]] as [string, string, number],
            ),
            notifyCalls: mockNotifyOwners.mock.calls.map(
              (c: any[]) => [c[0], c[1], c[2]] as [string, string, number],
            ),
          };

          // --- Second run (same inputs = same workflowId) ---
          jest.clearAllMocks();
          mockReleaseToCatPool.mockResolvedValue(undefined);
          mockAwardDonationXP.mockResolvedValue(undefined);
          mockNotifyOwners.mockResolvedValue(undefined);

          await donationEscrowWorkflow(donationId, donorId, catId, amountCents);

          const run2 = {
            releaseCalls: mockReleaseToCatPool.mock.calls.map(
              (c: any[]) => [c[0], c[1], c[2]] as [string, string, number],
            ),
            xpCalls: mockAwardDonationXP.mock.calls.map(
              (c: any[]) => [c[0], c[1], c[2]] as [string, string, number],
            ),
            notifyCalls: mockNotifyOwners.mock.calls.map(
              (c: any[]) => [c[0], c[1], c[2]] as [string, string, number],
            ),
          };

          // --- Assert idempotence ---

          // Same releaseToCatPool calls (no duplicate wallet deduction)
          expect(run1.releaseCalls).toEqual(run2.releaseCalls);
          expect(run1.releaseCalls.length).toBe(1);
          expect(run1.releaseCalls[0]).toEqual([donationId, catId, amountCents]);

          // Same awardDonationXP calls (same XP award)
          expect(run1.xpCalls).toEqual(run2.xpCalls);
          expect(run1.xpCalls.length).toBe(1);
          expect(run1.xpCalls[0]).toEqual([donorId, catId, amountCents]);

          // Same notifyOwners calls
          expect(run1.notifyCalls).toEqual(run2.notifyCalls);
          expect(run1.notifyCalls.length).toBe(1);
          expect(run1.notifyCalls[0]).toEqual([catId, donorId, amountCents]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
