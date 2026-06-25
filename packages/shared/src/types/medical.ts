import { UUID } from './user';

/** Type of medical request */
export type MedicalRequestType = 'vaccination' | 'sterilization' | 'treatment' | 'checkup';

/** Status of a medical request */
export type MedicalRequestStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'rejected';

/** Represents a medical care request for a cat */
export interface MedicalRequest {
  id: UUID;
  catId: UUID;
  requesterId: UUID;
  type: MedicalRequestType;
  status: MedicalRequestStatus;
  partnerId: UUID | null;
  /** Temporal workflow ID for tracking reimbursement */
  workflowId: string;
  /** JSON documents/receipts associated with this request */
  documents: string[];
  createdAt: Date;
}
