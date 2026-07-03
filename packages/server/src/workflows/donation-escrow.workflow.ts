/**
 * Donation Escrow Temporal Workflow
 *
 * Implements the donation escrow lifecycle:
 * 1. Hold the item value in escrow (durable sleep)
 * 2. Release funds to the cat's community pool
 * 3. Notify all Lvl1+ owners of the cat
 *
 * Donor XP is awarded synchronously at donation acceptance (see
 * DonationService.createDonation) so the app can confirm feeding instantly —
 * this workflow handles only the funds and notifications.
 *
 * Requirements: 10.6, 10.7, 14.4
 *
 * Uses workflowId = donationId for idempotence.
 * Resumes from last checkpoint on retry (Temporal event sourcing).
 */

import { proxyActivities, sleep } from '@temporalio/workflow';
import type { Duration } from '@temporalio/common';

import type * as activities from './activities/donation-escrow.activities';

// Proxy activities with retry policy
const {
  releaseToCatPool,
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
 * @param holdDuration - Escrow hold before release (ms-style string, e.g.
 *   '24 hours'). Passed by the client from DONATION_ESCROW_HOLD so local dev
 *   can use a short hold; production default stays 24 hours (Req 10.6).
 */
export async function donationEscrowWorkflow(
  donationId: string,
  donorId: string,
  catId: string,
  amountCents: number,
  holdDuration: string = '24 hours',
): Promise<void> {
  // Step 1: Hold in escrow (Temporal durable sleep)
  await sleep(holdDuration as Duration);

  // Step 2: Release donation to the cat's community pool
  await releaseToCatPool(donationId, catId, amountCents);

  // Step 3: Notify all Lvl1+ owners of the cat
  await notifyOwners(catId, donorId, amountCents);
}
