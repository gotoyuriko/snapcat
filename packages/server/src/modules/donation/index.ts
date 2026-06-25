import { Donation } from '@codingkitty/shared';

/**
 * Donation Module
 * Handles food donations with wallet/escrow workflow via Temporal.
 */

export interface DonationModule {
  /** Create a new donation (starts Temporal escrow workflow) */
  createDonation(donorId: string, catId: string, foodItemId: string, amountCents: number, source: string): Promise<Donation>;
  /** Mark donation as delivered (completes escrow) */
  confirmDelivery(donationId: string): Promise<Donation>;
  /** Cancel or refund a donation */
  cancelDonation(donationId: string): Promise<Donation>;
  /** Get donation history for a user */
  getUserDonations(userId: string): Promise<Donation[]>;
}

export { DonationService } from './donation.service';
export { DonationController } from './donation.controller';
export { donationRoutes } from './donation.routes';
