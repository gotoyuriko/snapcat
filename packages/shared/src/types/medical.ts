import { UUID } from './user';

/** Type of medical request (matches server: 'medical' | 'grooming') */
export type MedicalRequestType = 'medical' | 'grooming';

/**
 * Status of a medical request (matches server workflow lifecycle):
 * pending → awaiting_owner (owner picks a location) → pending_review (staff
 * arrange with the clinic) → in_progress (30-day service window) → reimbursed,
 * or rejected / timed_out.
 */
export type MedicalRequestStatus =
  | 'pending'
  | 'awaiting_owner'
  | 'pending_review'
  | 'in_progress'
  | 'reimbursed'
  | 'rejected'
  | 'timed_out';

/** One stage transition in a request's trail */
export interface MedicalRequestEvent {
  id: UUID;
  requestId: UUID;
  status: MedicalRequestStatus;
  note: string;
  createdAt: Date;
}

/** Represents a medical care request for a cat */
export interface MedicalRequest {
  id: UUID;
  catId: UUID;
  requesterId: UUID;
  type: MedicalRequestType;
  /** Requirement 9.4: requester's explanation of why care is needed */
  reason: string;
  status: MedicalRequestStatus;
  partnerId: UUID | null;
  /** Requirement 9.7: staff-supplied reason when status is 'rejected' */
  rejectionReason: string | null;
  /** Requirement 9.9: amount released from the community pool (MYR cents) */
  amountCents: number;
  reimbursedAt: Date | null;
  /** Temporal workflow ID for tracking reimbursement */
  workflowId: string;
  /** Signed URLs of supporting documents/receipts */
  documents: string[];
  createdAt: Date;
}

/** Certified partner shown when initiating a request (Requirement 9.13) */
export interface CertifiedPartner {
  id: UUID;
  name: string;
  type: 'vet' | 'salon';
  contactEmail: string;
  address: string;
  lat: number | null;
  lng: number | null;
}
