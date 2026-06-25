/**
 * Staff Verification Module
 * Handles partner organization verification and staff role management.
 */

export interface StaffVerificationModule {
  /** Submit partner verification request */
  submitVerification(partnerId: string, documents: string[]): Promise<void>;
  /** Approve a partner (admin action) */
  approvePartner(partnerId: string): Promise<void>;
  /** Reject a partner verification */
  rejectPartner(partnerId: string, reason: string): Promise<void>;
}

export { StaffVerificationService } from './staff-verification.service';
export { StaffVerificationController } from './staff-verification.controller';
export { staffVerificationRoutes } from './staff-verification.routes';
