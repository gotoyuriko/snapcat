/**
 * Unit tests for Medical Reimbursement Activities
 *
 * Tests the activity implementations directly (without Temporal runtime).
 * Mocks Prisma and external services.
 *
 * Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

// Mock PrismaClient
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    medicalRequest: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      update: mockUpdate,
    },
    partner: {
      findUnique: mockFindUnique,
    },
    ownership: {
      findMany: mockFindMany,
    },
  })),
}));

// Mock GamificationService
const mockRecordAction = jest.fn();
jest.mock('../../modules/gamification/gamification.service', () => ({
  GamificationService: jest.fn().mockImplementation(() => ({
    recordAction: mockRecordAction,
  })),
}));

// Mock AlertsService
const mockNotify = jest.fn();
jest.mock('../../modules/alerts/alerts.service', () => ({
  AlertsService: jest.fn().mockImplementation(() => ({
    notify: mockNotify,
  })),
}));

import {
  verifyRequest,
  notifyPartner,
  updateMedicalRequestStatus,
  verifyInvoice,
  releaseReimbursement,
  notifyUser,
  notifyOwners,
} from '../../workflows/activities/medical-reimbursement.activities';

describe('Medical Reimbursement Activities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyRequest', () => {
    it('should return approved=true when request is verified with partner (Req 9.3)', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'req-1',
        status: 'verified',
        partnerId: 'partner-1',
      });

      const result = await verifyRequest('req-1');

      expect(result.approved).toBe(true);
      expect(result.partnerId).toBe('partner-1');
    });

    it('should return approved=false when request not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await verifyRequest('non-existent');

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Request not found');
    });

    it('should return approved=false when request is still pending', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'req-1',
        status: 'pending',
        partnerId: null,
      });

      const result = await verifyRequest('req-1');

      expect(result.approved).toBe(false);
    });
  });

  describe('notifyPartner', () => {
    it('should succeed when partner exists (Req 9.4)', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'partner-1',
        name: 'PetCare Clinic',
        contactEmail: 'clinic@example.com',
      });

      await expect(notifyPartner('partner-1', 'req-1')).resolves.not.toThrow();
    });

    it('should throw when partner not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(notifyPartner('non-existent', 'req-1')).rejects.toThrow(
        'Partner non-existent not found',
      );
    });
  });

  describe('updateMedicalRequestStatus', () => {
    it('should update status in the database (Req 9.5)', async () => {
      mockUpdate.mockResolvedValue({ id: 'req-1', status: 'in_progress' });

      await updateMedicalRequestStatus('req-1', 'in_progress');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'in_progress' },
      });
    });

    it('should update status with partnerId when provided', async () => {
      mockUpdate.mockResolvedValue({ id: 'req-1', status: 'verified', partnerId: 'p-1' });

      await updateMedicalRequestStatus('req-1', 'verified', 'p-1');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'verified', partnerId: 'p-1' },
      });
    });
  });

  describe('verifyInvoice', () => {
    it('should return valid=false for empty invoice URL (Req 9.6)', async () => {
      const result = await verifyInvoice('');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('No invoice URL provided');
    });

    it('should return valid=true for non-empty invoice URL', async () => {
      const result = await verifyInvoice('https://example.com/invoice.pdf');

      expect(result.valid).toBe(true);
    });
  });

  describe('releaseReimbursement', () => {
    it('should throw for non-positive amount (Req 9.7)', async () => {
      await expect(releaseReimbursement('cat-1', 0, 'req-1')).rejects.toThrow(
        'Reimbursement amount must be positive',
      );
      await expect(releaseReimbursement('cat-1', -100, 'req-1')).rejects.toThrow(
        'Reimbursement amount must be positive',
      );
    });

    it('should succeed for positive amount', async () => {
      await expect(releaseReimbursement('cat-1', 5000, 'req-1')).resolves.not.toThrow();
    });
  });

  describe('notifyUser', () => {
    it('should call alerts service', async () => {
      mockNotify.mockResolvedValue(undefined);

      await notifyUser('user-1', 'Test message');

      expect(mockNotify).toHaveBeenCalledWith(
        'user-1',
        'Medical Request Update',
        'Test message',
      );
    });

    it('should not throw when notification fails', async () => {
      mockNotify.mockRejectedValue(new Error('Not implemented'));

      await expect(notifyUser('user-1', 'Test')).resolves.not.toThrow();
    });
  });

  describe('notifyOwners', () => {
    it('should notify all Lvl1+ owners of the cat', async () => {
      mockFindMany.mockResolvedValue([
        { userId: 'owner-1' },
        { userId: 'owner-2' },
      ]);
      mockNotify.mockResolvedValue(undefined);

      await notifyOwners('cat-1', 'Cat update');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { catId: 'cat-1', level: { gte: 1 } },
        select: { userId: true },
      });
      expect(mockNotify).toHaveBeenCalledTimes(2);
    });

    it('should not throw when individual notification fails', async () => {
      mockFindMany.mockResolvedValue([{ userId: 'owner-1' }]);
      mockNotify.mockRejectedValue(new Error('Failed'));

      await expect(notifyOwners('cat-1', 'Test')).resolves.not.toThrow();
    });
  });
});
