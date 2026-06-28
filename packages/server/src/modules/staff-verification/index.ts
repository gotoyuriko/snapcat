/**
 * Staff Verification Module
 * Handles staff-only CRUD for Partner records:
 * - Create partners (verified=false by default)
 * - Verify partners (set verified=true, makes them selectable for MedicalRequests)
 * - Revoke partners (set verified=false, immediate effect — blocks new assignments)
 */

export { StaffVerificationService } from './staff-verification.service';
export { StaffVerificationController } from './staff-verification.controller';
export { staffVerificationRoutes } from './staff-verification.routes';
