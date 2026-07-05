/**
 * Unit tests for Donation Escrow Activities
 *
 * Tests the core activity logic for the donation escrow workflow:
 * - releaseToCatPool: updates donation status to "released"
 * - notifyOwners: sends notifications to Lvl1+ owners
 * - updateDonationStatus: updates donation record status
 *
 * Donor XP is awarded at donation acceptance (DonationService), not by
 * this workflow — see donation.service tests.
 */

// Mock PrismaClient before imports
const mockDonationUpdate = jest.fn().mockResolvedValue({});
const mockOwnershipFindMany = jest.fn().mockResolvedValue([]);
const mockUserFindUnique = jest.fn().mockResolvedValue(null);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    donation: { update: mockDonationUpdate },
    ownership: { findMany: mockOwnershipFindMany },
    user: { findUnique: mockUserFindUnique },
  })),
}));

// Mock AlertsService
const mockNotify = jest.fn().mockResolvedValue(undefined);
jest.mock('../../modules/alerts/alerts.service', () => ({
  AlertsService: jest.fn(() => ({
    notify: mockNotify,
  })),
}));

import {
  releaseToCatPool,
  notifyOwners,
  updateDonationStatus,
} from '../../workflows/activities/donation-escrow.activities';

describe('Donation Escrow Activities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('releaseToCatPool', () => {
    it('should update donation status to released', async () => {
      const donationId = 'donation-123';
      const catId = 'cat-456';
      const amountCents = 1500;

      await releaseToCatPool(donationId, catId, amountCents);

      expect(mockDonationUpdate).toHaveBeenCalledWith({
        where: { id: donationId },
        data: { status: 'released' },
      });
    });
  });

  describe('notifyOwners', () => {
    it('should notify all Lvl1+ owners of the cat', async () => {
      const catId = 'cat-456';
      const donorId = 'user-789';
      const amountCents = 1500;

      mockOwnershipFindMany.mockResolvedValue([
        { userId: 'owner-1' },
        { userId: 'owner-2' },
      ]);
      mockUserFindUnique.mockResolvedValue({ displayName: 'Alice' });

      await notifyOwners(catId, donorId, amountCents);

      expect(mockOwnershipFindMany).toHaveBeenCalledWith({
        where: { catId, level: { gte: 1 }, revokedAt: null },
        select: { userId: true },
      });
      expect(mockNotify).toHaveBeenCalledTimes(2);
      expect(mockNotify).toHaveBeenCalledWith(
        'owner-1',
        'Donation Released',
        'Alice donated RM15.00 worth of food to your cat!',
        { catId, donorId, amountCents: '1500' },
      );
      expect(mockNotify).toHaveBeenCalledWith(
        'owner-2',
        'Donation Released',
        'Alice donated RM15.00 worth of food to your cat!',
        { catId, donorId, amountCents: '1500' },
      );
    });

    it('should use "Someone" when donor is not found', async () => {
      const catId = 'cat-456';
      const donorId = 'unknown-user';
      const amountCents = 500;

      mockOwnershipFindMany.mockResolvedValue([{ userId: 'owner-1' }]);
      mockUserFindUnique.mockResolvedValue(null);

      await notifyOwners(catId, donorId, amountCents);

      expect(mockNotify).toHaveBeenCalledWith(
        'owner-1',
        'Donation Released',
        'Someone donated RM5.00 worth of food to your cat!',
        { catId, donorId, amountCents: '500' },
      );
    });

    it('should not throw if no Lvl1+ owners exist', async () => {
      const catId = 'cat-456';
      const donorId = 'user-789';
      const amountCents = 1000;

      mockOwnershipFindMany.mockResolvedValue([]);

      await expect(notifyOwners(catId, donorId, amountCents)).resolves.not.toThrow();
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('should continue notifying other owners if one notification fails', async () => {
      const catId = 'cat-456';
      const donorId = 'user-789';
      const amountCents = 1000;

      mockOwnershipFindMany.mockResolvedValue([
        { userId: 'owner-1' },
        { userId: 'owner-2' },
      ]);
      mockUserFindUnique.mockResolvedValue({ displayName: 'Bob' });
      mockNotify
        .mockRejectedValueOnce(new Error('Push failed'))
        .mockResolvedValueOnce(undefined);

      await expect(notifyOwners(catId, donorId, amountCents)).resolves.not.toThrow();
      expect(mockNotify).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateDonationStatus', () => {
    it('should update the donation record status', async () => {
      const donationId = 'donation-123';
      const status = 'released';

      await updateDonationStatus(donationId, status);

      expect(mockDonationUpdate).toHaveBeenCalledWith({
        where: { id: donationId },
        data: { status },
      });
    });
  });
});
