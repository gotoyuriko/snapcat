import { MedicalRequest } from '@codingkitty/shared';

/**
 * Medical Module
 * Handles veterinary care requests and reimbursement workflows via Temporal.
 */

export interface MedicalModule {
  /** Create a medical care request (starts Temporal reimbursement workflow) */
  createRequest(catId: string, requesterId: string, type: string): Promise<MedicalRequest>;
  /** Approve a medical request (staff) — owner then chooses the location */
  approveRequest(requestId: string): Promise<MedicalRequest>;
  /** Owner picks the certified location (awaiting_owner → pending_review) */
  choosePartner(requestId: string, requesterId: string, partnerId: string): Promise<void>;
  /** Upload document/receipt for a medical request */
  uploadDocument(requestId: string, documentUrl: string): Promise<MedicalRequest>;
  /** Complete a medical request */
  completeRequest(requestId: string): Promise<MedicalRequest>;
}

export { MedicalService } from './medical.service';
export { MedicalController } from './medical.controller';
export { medicalRoutes } from './medical.routes';
export { DocumentStorageService } from './document-storage.service';
