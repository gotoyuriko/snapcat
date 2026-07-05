import { PrismaClient } from '@prisma/client';
import { AlertsService } from '../../modules/alerts/alerts.service';

const prisma = new PrismaClient();
const alertsService = new AlertsService();

/**
 * Release the escrowed donation to the cat's community pool.
 * Transitions the Donation record status from "escrowed" to "released".
 *
 * Requirement 10.6: After 24h hold, funds are released to the cat pool.
 */
export async function releaseToCatPool(
  donationId: string,
  catId: string,
  amountCents: number,
): Promise<void> {
  await prisma.donation.update({
    where: { id: donationId },
    data: { status: 'released' },
  });

  // In production: credit the cat's community pool balance
  console.log(
    `[donation-escrow] Released ${amountCents} cents to cat pool for cat ${catId}, donation ${donationId}`,
  );
}

/**
 * Notify all Lvl1+ owners of a cat that a donation has been released.
 *
 * Requirement 14.4: Cat owners are notified of significant events.
 */
export async function notifyOwners(
  catId: string,
  donorId: string,
  amountCents: number,
): Promise<void> {
  // Revoked owners lose notifications (Requirement 16.2).
  const owners = await prisma.ownership.findMany({
    where: { catId, level: { gte: 1 }, revokedAt: null },
    select: { userId: true },
  });

  const donor = await prisma.user.findUnique({
    where: { id: donorId },
    select: { displayName: true },
  });

  const donorName = donor?.displayName ?? 'Someone';
  const amountMYR = (amountCents / 100).toFixed(2);

  for (const owner of owners) {
    try {
      await alertsService.notify(
        owner.userId,
        'Donation Released',
        `${donorName} donated RM${amountMYR} worth of food to your cat!`,
        { catId, donorId, amountCents: String(amountCents) },
      );
    } catch {
      // Individual notification failure shouldn't stop others
      console.log(
        `[donation-escrow] Failed to notify owner ${owner.userId} for cat ${catId}`,
      );
    }
  }
}

/**
 * Update the status of a donation record.
 */
export async function updateDonationStatus(
  donationId: string,
  status: string,
): Promise<void> {
  await prisma.donation.update({
    where: { id: donationId },
    data: { status },
  });
}
