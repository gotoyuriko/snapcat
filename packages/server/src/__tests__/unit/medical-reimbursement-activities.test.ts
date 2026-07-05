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
const mockDonationAggregate = jest.fn();
const mockRequestAggregate = jest.fn();
const mockUserUpdate = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock: any = {
  medicalRequest: {
    findUnique: mockFindUnique,
    findFirst: mockFindFirst,
    update: mockUpdate,
    aggregate: mockRequestAggregate,
  },
  medicalRequestEvent: {
    create: jest.fn().mockResolvedValue({}),
  },
  partner: {
    findUnique: mockFindUnique,
  },
  ownership: {
    findMany: mockFindMany,
  },
  donation: {
    aggregate: mockDonationAggregate,
  },
  user: {
    update: mockUserUpdate,
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => prismaMock),
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

    it('should return valid=false for empty receipt URL (Req 9.8)', async () => {
      const result = await verifyInvoice('https://example.com/invoice.pdf', '');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('No receipt URL provided');
    });

    it('should return valid=true for non-empty invoice and receipt URLs', async () => {
      const result = await verifyInvoice(
        'https://example.com/invoice.pdf',
        'https://example.com/receipt.pdf',
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('releaseReimbursement (Req 9.9)', () => {
    it('should throw for non-positive amount', async () => {
      await expect(releaseReimbursement('cat-1', 'user-1', 0, 'req-1')).rejects.toThrow(
        'Reimbursement amount must be positive',
      );
      await expect(releaseReimbursement('cat-1', 'user-1', -100, 'req-1')).rejects.toThrow(
        'Reimbursement amount must be positive',
      );
    });

    it('should debit the pool and record the release when funds suffice', async () => {
      mockFindUnique.mockResolvedValue({ id: 'req-1', reimbursedAt: null });
      mockDonationAggregate.mockResolvedValue({ _sum: { amountCents: 10000 } });
      mockRequestAggregate.mockResolvedValue({ _sum: { amountCents: 2000 } });
      mockUpdate.mockResolvedValue({});

      const result = await releaseReimbursement('cat-1', 'user-1', 5000, 'req-1');

      expect(result.released).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { amountCents: 5000, reimbursedAt: expect.any(Date) },
      });
      // Wallet was removed (direct-checkout rework) — no user balance update.
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('should refuse release when pool balance is insufficient', async () => {
      mockFindUnique.mockResolvedValue({ id: 'req-1', reimbursedAt: null });
      mockDonationAggregate.mockResolvedValue({ _sum: { amountCents: 3000 } });
      mockRequestAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });

      const result = await releaseReimbursement('cat-1', 'user-1', 5000, 'req-1');

      expect(result.released).toBe(false);
      expect(mockUserUpdate).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should be idempotent — an already-reimbursed request is not paid twice', async () => {
      mockFindUnique.mockResolvedValue({ id: 'req-1', reimbursedAt: new Date() });

      const result = await releaseReimbursement('cat-1', 'user-1', 5000, 'req-1');

      expect(result.released).toBe(true);
      expect(mockUserUpdate).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
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
        where: { catId: 'cat-1', level: { gte: 1 }, revokedAt: null },
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
