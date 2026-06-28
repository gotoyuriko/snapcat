// --- Prisma mock setup ---
const mockPrisma = {
  partner: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { StaffVerificationService } from '../staff-verification.service';

describe('StaffVerificationService', () => {
  let service: StaffVerificationService;

  beforeEach(() => {
    service = new StaffVerificationService();
    jest.clearAllMocks();
  });

  // ─── Partner Creation ───────────────────────────────────────────────────────

  describe('createPartner()', () => {
    it('creates a partner with verified=false by default', async () => {
      const input = { name: 'Vet Clinic A', type: 'vet', contactEmail: 'vet@example.com' };
      const expectedPartner = { id: 'p-1', ...input, verified: false };
      mockPrisma.partner.create.mockResolvedValue(expectedPartner);

      const result = await service.createPartner(input);

      expect(mockPrisma.partner.create).toHaveBeenCalledWith({
        data: {
          name: 'Vet Clinic A',
          type: 'vet',
          contactEmail: 'vet@example.com',
          verified: false,
        },
      });
      expect(result.verified).toBe(false);
    });

    it('newly created partners are NOT selectable (not in verified list)', async () => {
      // Create partner (verified=false)
      const newPartner = { id: 'p-2', name: 'Salon B', type: 'salon', contactEmail: 'salon@example.com', verified: false };
      mockPrisma.partner.create.mockResolvedValue(newPartner);
      await service.createPartner({ name: 'Salon B', type: 'salon', contactEmail: 'salon@example.com' });

      // Listing verified partners returns empty — new partner not included
      mockPrisma.partner.findMany.mockResolvedValue([]);
      const verifiedPartners = await service.listPartners({ verified: true });

      expect(mockPrisma.partner.findMany).toHaveBeenCalledWith({ where: { verified: true } });
      expect(verifiedPartners).toEqual([]);
    });
  });

  // ─── Partner Verification ───────────────────────────────────────────────────

  describe('verifyPartner()', () => {
    it('sets verified=true for the given partner', async () => {
      const verifiedPartner = { id: 'p-1', name: 'Vet Clinic A', type: 'vet', contactEmail: 'vet@example.com', verified: true };
      mockPrisma.partner.update.mockResolvedValue(verifiedPartner);

      const result = await service.verifyPartner('p-1');

      expect(mockPrisma.partner.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { verified: true },
      });
      expect(result.verified).toBe(true);
    });

    it('after verification the partner appears in listPartners({verified: true})', async () => {
      const verifiedPartner = { id: 'p-1', name: 'Vet Clinic A', type: 'vet', contactEmail: 'vet@example.com', verified: true };
      mockPrisma.partner.update.mockResolvedValue(verifiedPartner);
      await service.verifyPartner('p-1');

      // Now list verified partners — should include the partner
      mockPrisma.partner.findMany.mockResolvedValue([verifiedPartner]);
      const verifiedPartners = await service.listPartners({ verified: true });

      expect(verifiedPartners).toContainEqual(expect.objectContaining({ id: 'p-1', verified: true }));
    });
  });

  // ─── Partner Revocation ─────────────────────────────────────────────────────

  describe('revokePartner()', () => {
    it('sets verified=false immediately (no grace period)', async () => {
      const revokedPartner = { id: 'p-1', name: 'Vet Clinic A', type: 'vet', contactEmail: 'vet@example.com', verified: false };
      mockPrisma.partner.update.mockResolvedValue(revokedPartner);

      const result = await service.revokePartner('p-1');

      expect(mockPrisma.partner.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { verified: false },
      });
      expect(result.verified).toBe(false);
    });

    it('after revocation the partner no longer appears in listPartners({verified: true})', async () => {
      const revokedPartner = { id: 'p-1', name: 'Vet Clinic A', type: 'vet', contactEmail: 'vet@example.com', verified: false };
      mockPrisma.partner.update.mockResolvedValue(revokedPartner);
      await service.revokePartner('p-1');

      // List verified partners — revoked partner should NOT be included
      mockPrisma.partner.findMany.mockResolvedValue([]);
      const verifiedPartners = await service.listPartners({ verified: true });

      expect(verifiedPartners).not.toContainEqual(expect.objectContaining({ id: 'p-1' }));
    });
  });

  // ─── Assignment Blocking (Requirement 13.3 & 13.4) ─────────────────────────

  describe('assignment blocking after revocation', () => {
    it('revoked partner is excluded from the verified partner pool used for MedicalRequest assignment', async () => {
      // Scenario: partner was verified, then revoked
      const partnerA = { id: 'p-1', name: 'Vet A', type: 'vet', contactEmail: 'a@vet.com', verified: true };
      const partnerB = { id: 'p-2', name: 'Vet B', type: 'vet', contactEmail: 'b@vet.com', verified: true };

      // Revoke partner A
      mockPrisma.partner.update.mockResolvedValue({ ...partnerA, verified: false });
      await service.revokePartner('p-1');

      // When selecting partners for MedicalRequest assignment, only verified partners are listed
      mockPrisma.partner.findMany.mockResolvedValue([partnerB]);
      const selectablePartners = await service.listPartners({ verified: true });

      expect(selectablePartners).toHaveLength(1);
      expect(selectablePartners[0].id).toBe('p-2');
      expect(selectablePartners).not.toContainEqual(expect.objectContaining({ id: 'p-1' }));
    });

    it('only verified=true partners are selectable per Requirement 13.3', async () => {
      const verifiedPartner = { id: 'p-3', name: 'Salon C', type: 'salon', contactEmail: 'c@salon.com', verified: true };
      const unverifiedPartner = { id: 'p-4', name: 'Salon D', type: 'salon', contactEmail: 'd@salon.com', verified: false };

      // listPartners with verified=true should only return verified partners
      mockPrisma.partner.findMany.mockResolvedValue([verifiedPartner]);
      const result = await service.listPartners({ verified: true });

      expect(mockPrisma.partner.findMany).toHaveBeenCalledWith({ where: { verified: true } });
      expect(result).toContainEqual(expect.objectContaining({ id: 'p-3', verified: true }));
      expect(result).not.toContainEqual(expect.objectContaining({ id: 'p-4' }));
    });
  });

  // ─── getPartner ─────────────────────────────────────────────────────────────

  describe('getPartner()', () => {
    it('returns the partner when found', async () => {
      const partner = { id: 'p-1', name: 'Vet A', type: 'vet', contactEmail: 'a@vet.com', verified: true };
      mockPrisma.partner.findUnique.mockResolvedValue(partner);

      const result = await service.getPartner('p-1');

      expect(mockPrisma.partner.findUnique).toHaveBeenCalledWith({ where: { id: 'p-1' } });
      expect(result).toEqual(partner);
    });

    it('returns null when partner not found', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(null);

      const result = await service.getPartner('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── listPartners ───────────────────────────────────────────────────────────

  describe('listPartners()', () => {
    it('lists all partners when no filter is provided', async () => {
      const partners = [
        { id: 'p-1', name: 'Vet A', type: 'vet', contactEmail: 'a@vet.com', verified: true },
        { id: 'p-2', name: 'Salon B', type: 'salon', contactEmail: 'b@salon.com', verified: false },
      ];
      mockPrisma.partner.findMany.mockResolvedValue(partners);

      const result = await service.listPartners();

      expect(mockPrisma.partner.findMany).toHaveBeenCalledWith({ where: {} });
      expect(result).toHaveLength(2);
    });

    it('filters partners by verified=false', async () => {
      const unverifiedPartners = [
        { id: 'p-2', name: 'Salon B', type: 'salon', contactEmail: 'b@salon.com', verified: false },
      ];
      mockPrisma.partner.findMany.mockResolvedValue(unverifiedPartners);

      const result = await service.listPartners({ verified: false });

      expect(mockPrisma.partner.findMany).toHaveBeenCalledWith({ where: { verified: false } });
      expect(result).toHaveLength(1);
      expect(result[0].verified).toBe(false);
    });
  });
});
