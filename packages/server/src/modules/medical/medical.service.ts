import { MedicalRequest } from '@codingkitty/shared';

/**
 * TODO: Implement MedicalService
 * - Create medical requests
 * - Start Temporal medical-reimbursement workflow
 * - Handle approval, document upload, and completion
 */

export class MedicalService {
  async createRequest(_catId: string, _requesterId: string, _type: string): Promise<MedicalRequest> {
    // TODO: Create request, start Temporal workflow
    throw new Error('Not implemented');
  }

  async approveRequest(_requestId: string, _partnerId: string): Promise<MedicalRequest> {
    // TODO: Update status, signal Temporal workflow
    throw new Error('Not implemented');
  }

  async uploadDocument(_requestId: string, _documentUrl: string): Promise<MedicalRequest> {
    // TODO: Append document URL to request
    throw new Error('Not implemented');
  }

  async completeRequest(_requestId: string): Promise<MedicalRequest> {
    // TODO: Mark as completed, trigger reimbursement
    throw new Error('Not implemented');
  }
}
