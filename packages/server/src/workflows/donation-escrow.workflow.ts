/**
 * Donation Escrow Temporal Workflow
 *
 * Implements the donation escrow lifecycle:
 * 1. Hold the item value in escrow for 24 hours (durable sleep)
 * 2. Release funds to the cat's community pool
 * 3. Award XP to the donor
 * 4. Notify all Lvl1+ owners of the cat
 *
 * Requirements: 10.6, 10.7, 14.4
 *
 * Uses workflowId = donationId for idempotence.
 * Resumes from last checkpoint on retry (Temporal event sourcing).
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type * as activities from './activities/donation-escrow.activities';

// Proxy activities with retry policy
const {
  releaseToCatPool,
  awardDonationXP,
  notifyOwners,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 3,
  },
});

/**
 * Donation Escrow Workflow
 *
 * @param donationId - The donation ID (also used as workflowId for idempotence)
 * @param donorId - The user who made the donation
 * @param catId - The cat receiving the donation
 * @param amountCents - The donation value in MYR cents
 */
export async function donationEscrowWorkflow(
  donationId: string,
  donorId: string,
  catId: string,
  amountCents: number,
): Promise<void> {
  // Step 1: Hold in escrow for 24 hours (Temporal durable sleep)
  await sleep('24 hours');

  // Step 2: Release donation to the cat's community pool
  await releaseToCatPool(donationId, catId, amountCents);

  // Step 3: Award XP to the donor (XP = amountCents / 100, capped at 200/day)
  await awardDonationXP(donorId, catId, amountCents);

  // Step 4: Notify all Lvl1+ owners of the cat
  await notifyOwners(catId, donorId, amountCents);
}
