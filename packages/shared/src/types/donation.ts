import { UUID } from './user';

/** Source of the donation funds */
export type DonationSource = 'wallet' | 'direct_payment';

/** Status of a donation workflow */
export type DonationStatus = 'pending' | 'escrowed' | 'delivered' | 'refunded' | 'cancelled';

/** Represents a food donation to a cat */
export interface Donation {
  id: UUID;
  donorId: UUID;
  catId: UUID;
  foodItemId: UUID;
  amountCents: number;
  source: DonationSource;
  /** Temporal workflow ID for tracking escrow state */
  workflowId: string;
  status: DonationStatus;
  createdAt: Date;
}
