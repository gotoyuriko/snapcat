import { PrismaClient, MedicalRequest as PrismaMedicalRequest, Partner } from '@prisma/client';
import { DocumentStorageService } from './document-storage.service';
import {
  startMedicalReimbursementWorkflow,
  signalStaffDecision,
  signalPartnerAccepted,
  signalServiceCompleted,
  signalDocumentsResubmitted,
} from '../../workflows/temporal-client';

const prisma = new PrismaClient();

export interface CreateMedicalRequestInput {
  catId: string;
  requesterId: string;
  type: string;
  reason: string;
  documents: Array<{ buffer: Buffer; originalName: string }>;
}

export class MedicalRequestNotFoundError extends Error {
  constructor() {
    super('Medical request not found');
    this.name = 'MedicalRequestNotFoundError';
  }
}

/**
 * MedicalService
 * Handles creation of medical requests, document uploads, and workflow management.
 */
export class MedicalService {
  private readonly documentStorage: DocumentStorageService;

  constructor() {
    this.documentStorage = new DocumentStorageService();
  }

  /**
   * Create a medical request with optional document uploads.
   * - Stores documents in object storage with signed URLs
   * - Creates MedicalRequest record with status "pending"
   * - Starts the Temporal Medical Reimbursement workflow (workflowId = requestId)
   * - Returns the created request
   *
   * Requirement 9.1: Lvl7+ Owner can submit a MedicalRequest
   * Requirement 9.9: Store supporting documents in private object storage with signed URL access
   * Requirement 15.4: Idempotent workflow start via workflowId = requestId
   */
  async createRequest(input: CreateMedicalRequestInput): Promise<PrismaMedicalRequest> {
    const { catId, requesterId, type, reason, documents } = input;

    // Generate a placeholder ID for document storage path
    const requestId = crypto.randomUUID();

    // Upload documents to object storage and collect signed URLs
    const documentUrls: string[] = [];
    if (documents && documents.length > 0) {
      for (const doc of documents) {
        const signedUrl = await this.documentStorage.storeDocument(
          doc.buffer,
          doc.originalName,
          requestId,
        );
        documentUrls.push(signedUrl);
      }
    }

    // Create MedicalRequest record with status "pending"
    const medicalRequest = await prisma.medicalRequest.create({
      data: {
        id: requestId,
        catId,
        requesterId,
        type,
        reason,
        status: 'pending',
        documents: documentUrls,
        workflowId: requestId, // workflowId = requestId for idempotence
      },
    });

    // Start the Temporal workflow (workflowId = requestId for idempotence)
    try {
      await startMedicalReimbursementWorkflow(requestId, requesterId, catId);
    } catch (error) {
      // Log but don't fail the request creation — workflow can be retried
      console.error('Failed to start medical reimbursement workflow:', error);
    }

    return medicalRequest;
  }

  /**
   * Certified partner locations shown to the requester when initiating a
   * request (Requirement 9.13). Reimbursement is only processed for visits
   * to one of these verified partners.
   */
  async getCertifiedPartners(): Promise<Pick<Partner, 'id' | 'name' | 'type' | 'contactEmail'>[]> {
    return prisma.partner.findMany({
      where: { verified: true },
      select: { id: true, name: true, type: true, contactEmail: true },
    });
  }

  private async getRequestOrThrow(requestId: string): Promise<PrismaMedicalRequest> {
    const request = await prisma.medicalRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new MedicalRequestNotFoundError();
    return request;
  }

  /**
   * Staff approves the request and assigns a certified partner (Req 9.5, 9.6).
   * Signals the workflow, which owns the status transition + notifications.
   */
  async approveRequest(
    requestId: string,
    partnerId: string,
    appointmentDetails?: string,
  ): Promise<void> {
    await this.getRequestOrThrow(requestId);
    const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner || !partner.verified) {
      throw new Error('Partner not found or not certified');
    }
    await signalStaffDecision(requestId, { approved: true, partnerId, appointmentDetails });
  }

  /** Staff rejects the request (Req 9.7). The workflow updates status + notifies. */
  async rejectRequest(requestId: string): Promise<void> {
    await this.getRequestOrThrow(requestId);
    await signalStaffDecision(requestId, { approved: false });
  }

  /** Partner accepts the assignment — moves the workflow to in_progress. */
  async partnerAccept(requestId: string): Promise<void> {
    await this.getRequestOrThrow(requestId);
    await signalPartnerAccepted(requestId);
  }

  /**
   * Submit completion documents (Req 9.8): partner invoice AND user receipt
   * are both required before the workflow may progress toward 'reimbursed'.
   * When `resubmission` is true, signals the rejected → reimbursed path.
   */
  async submitCompletionDocuments(
    requestId: string,
    invoice: { buffer: Buffer; originalName: string },
    receipt: { buffer: Buffer; originalName: string },
    resubmission: boolean,
  ): Promise<{ invoiceUrl: string; receiptUrl: string }> {
    const request = await this.getRequestOrThrow(requestId);

    const invoiceUrl = await this.documentStorage.storeDocument(
      invoice.buffer,
      invoice.originalName,
      requestId,
    );
    const receiptUrl = await this.documentStorage.storeDocument(
      receipt.buffer,
      receipt.originalName,
      requestId,
    );

    await prisma.medicalRequest.update({
      where: { id: requestId },
      data: { documents: [...request.documents, invoiceUrl, receiptUrl] },
    });

    if (resubmission) {
      await signalDocumentsResubmitted(requestId, invoiceUrl);
    } else {
      await signalServiceCompleted(requestId, invoiceUrl);
    }

    return { invoiceUrl, receiptUrl };
  }
}
