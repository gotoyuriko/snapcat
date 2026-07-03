import { PrismaClient } from '@prisma/client';
import { Donation, XPResult } from '@codingkitty/shared';
import { startDonationEscrowWorkflow } from '../../workflows/temporal-client';
import { GamificationService } from '../gamification/gamification.service';

const prisma = new PrismaClient();

/** Donation record plus the XP effect of the donation, for instant client feedback. */
export type DonationWithXP = Donation & XPResult;

/**
 * DonationService
 * Handles food donations from user inventory to cats via Temporal escrow workflow.
 */
export class DonationService {
  private gamificationService: GamificationService;

  constructor(gamificationService?: GamificationService) {
    this.gamificationService = gamificationService ?? new GamificationService(prisma);
  }

  /**
   * Create a donation by deducting a food item from the user's inventory.
   *
   * - Rejects if UserInventory record doesn't exist or quantity <= 0.
   * - Atomically decrements inventory and creates a Donation record.
   * - Awards donor XP immediately (Req 6.3) so the app can confirm the
   *   donation together with its XP effect in the same response.
   * - Starts Temporal DonationEscrow workflow AFTER transaction commits —
   *   the workflow releases only the funds to the community pool.
   *
   * Requirements: 6.3, 10.5, 10.6
   */
  async createDonation(
    donorId: string,
    catId: string,
    foodItemId: string,
    quantity = 1,
  ): Promise<DonationWithXP> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Invalid quantity');
    }

    // Check inventory availability
    const inventory = await prisma.userInventory.findUnique({
      where: {
        userId_foodItemId: { userId: donorId, foodItemId },
      },
    });

    if (!inventory || inventory.quantity < quantity) {
      throw new Error('Insufficient inventory');
    }

    // Get food item details for the donation record
    const foodItem = await prisma.foodItem.findUnique({
      where: { id: foodItemId },
    });

    if (!foodItem) {
      throw new Error('Food item not found');
    }

    // Atomic transaction: decrement inventory + create donation
    const donation = await prisma.$transaction(async (tx) => {
      // Decrement inventory by the donated quantity, guarding against a
      // concurrent donation having spent the stock since the check above.
      const updated = await tx.userInventory.updateMany({
        where: {
          userId: donorId,
          foodItemId,
          quantity: { gte: quantity },
        },
        data: {
          quantity: { decrement: quantity },
        },
      });
      if (updated.count === 0) {
        throw new Error('Insufficient inventory');
      }

      // Create donation record — one record for the whole batch
      const newDonation = await tx.donation.create({
        data: {
          donorId,
          catId,
          foodItemId,
          foodItem: quantity > 1 ? `${foodItem.name} ×${quantity}` : foodItem.name,
          amountCents: foodItem.priceCents * quantity,
          source: 'wallet',
          status: 'escrowed',
          workflowId: '', // Will be updated after workflow starts
        },
      });

      return newDonation;
    });

    // Award donor XP immediately (1 XP per MYR, capped at 200/day per cat).
    // Failure must not undo the committed donation — fall back to zero XP.
    let xp: XPResult = { xpAwarded: 0, newLevel: 0, levelUp: false };
    try {
      xp = await this.gamificationService.recordAction(
        donorId,
        catId,
        'donation',
        donation.amountCents,
      );
    } catch {
      // XP bookkeeping failure shouldn't fail the donation itself
    }

    // Start Temporal workflow AFTER transaction commits
    try {
      await startDonationEscrowWorkflow(
        donation.id,
        donorId,
        catId,
        donation.amountCents,
      );

      // Update the donation record with the workflowId
      await prisma.donation.update({
        where: { id: donation.id },
        data: { workflowId: donation.id },
      });
    } catch {
      // Temporal may not be available in dev/test — donation is still valid
      // The workflow can be retried later
    }

    return { ...(donation as unknown as Donation), ...xp };
  }

  /**
   * Get donation history for a user.
   */
  async getUserDonations(userId: string): Promise<Donation[]> {
    const donations = await prisma.donation.findMany({
      where: { donorId: userId },
      orderBy: { createdAt: 'desc' },
    });

    return donations as unknown as Donation[];
  }
}
