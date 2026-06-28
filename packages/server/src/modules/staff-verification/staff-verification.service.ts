import { PrismaClient, Partner } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreatePartnerData {
  name: string;
  type: string;
  contactEmail: string;
}

export interface PartnerFilter {
  verified?: boolean;
}

/**
 * StaffVerificationService
 * Handles CRUD operations for Partner records.
 * - Partners are created with verified=false by default.
 * - Staff can verify (set verified=true) or revoke (set verified=false, immediate effect).
 */
export class StaffVerificationService {
  /**
   * Create a new Partner record with verified=false.
   */
  async createPartner(data: CreatePartnerData): Promise<Partner> {
    return prisma.partner.create({
      data: {
        name: data.name,
        type: data.type,
        contactEmail: data.contactEmail,
        verified: false,
      },
    });
  }

  /**
   * Set a Partner's verified flag to true, making them selectable for MedicalRequests.
   * Requirement 13.2: Only this mechanism makes a Partner selectable.
   */
  async verifyPartner(partnerId: string): Promise<Partner> {
    return prisma.partner.update({
      where: { id: partnerId },
      data: { verified: true },
    });
  }

  /**
   * Revoke a Partner's verified status — sets verified=false with immediate effect.
   * Requirement 13.4: No grace period; blocks new MedicalRequest assignments immediately.
   */
  async revokePartner(partnerId: string): Promise<Partner> {
    return prisma.partner.update({
      where: { id: partnerId },
      data: { verified: false },
    });
  }

  /**
   * Get a single Partner by ID.
   */
  async getPartner(partnerId: string): Promise<Partner | null> {
    return prisma.partner.findUnique({
      where: { id: partnerId },
    });
  }

  /**
   * List Partners with optional filter by verified status.
   */
  async listPartners(filter?: PartnerFilter): Promise<Partner[]> {
    const where: { verified?: boolean } = {};
    if (filter?.verified !== undefined) {
      where.verified = filter.verified;
    }
    return prisma.partner.findMany({ where });
  }
}
