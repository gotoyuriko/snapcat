import { PrismaClient, MedicalRequest as PrismaMedicalRequest } from '@prisma/client';
import { DocumentStorageService } from './document-storage.service';
import { startMedicalReimbursementWorkflow } from '../../workflows/temporal-client';

const prisma = new PrismaClient();

export interface CreateMedicalRequestInput {
  catId: string;
  requesterId: string;
  type: string;
  documents?: Array<{ buffer: Buffer; originalName: string }>;
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
    const { catId, requesterId, type, documents } = input;

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

  async approveRequest(requestId: string, partnerId: string): Promise<PrismaMedicalRequest> {
    // TODO: Update status, signal Temporal workflow (Task 11.3)
    return prisma.medicalRequest.update({
      where: { id: requestId },
      data: { status: 'verified', partnerId },
    });
  }

  async uploadDocument(requestId: string, documentUrl: string): Promise<PrismaMedicalRequest> {
    const request = await prisma.medicalRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new Error('Medical request not found');
    }

    return prisma.medicalRequest.update({
      where: { id: requestId },
      data: {
        documents: [...request.documents, documentUrl],
      },
    });
  }

  async completeRequest(requestId: string): Promise<PrismaMedicalRequest> {
    // TODO: Mark as completed, trigger reimbursement (Task 11.3)
    return prisma.medicalRequest.update({
      where: { id: requestId },
      data: { status: 'reimbursed' },
    });
  }
}
