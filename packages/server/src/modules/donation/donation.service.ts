import { Donation } from '@codingkitty/shared';

/**
 * TODO: Implement DonationService
 * - Create donation records
 * - Start Temporal donation-escrow workflow
 * - Handle delivery confirmation and refunds
 */

export class DonationService {
  async createDonation(
    _donorId: string,
    _catId: string,
    _foodItemId: string,
    _amountCents: number,
    _source: string,
  ): Promise<Donation> {
    // TODO: Debit wallet, create donation, start Temporal workflow
    throw new Error('Not implemented');
  }

  async confirmDelivery(_donationId: string): Promise<Donation> {
    // TODO: Signal Temporal workflow, update status
    throw new Error('Not implemented');
  }

  async cancelDonation(_donationId: string): Promise<Donation> {
    // TODO: Signal Temporal workflow to refund, update status
    throw new Error('Not implemented');
  }

  async getUserDonations(_userId: string): Promise<Donation[]> {
    // TODO: Query user's donation history
    throw new Error('Not implemented');
  }
}
