import { PrismaClient, MedicalRequest as PrismaMedicalRequest, Partner } from '@prisma/client';
import { DocumentStorageService } from './document-storage.service';
import { AlertsService } from '../alerts/alerts.service';
import {
  startMedicalReimbursementWorkflow,
  signalStaffDecision,
  signalOwnerChosePartner,
  signalPartnerAccepted,
  signalServiceCompleted,
  signalDocumentsResubmitted,
} from '../../workflows/temporal-client';

const prisma = new PrismaClient();
const alertsService = new AlertsService();

/** Partner type that matches each request type (medical → vet, grooming → salon). */
const PARTNER_TYPE_FOR_REQUEST: Record<string, string> = {
  medical: 'vet',
  grooming: 'salon',
};

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

    // Stage trail starts at 'pending'.
    await prisma.medicalRequestEvent.create({
      data: {
        requestId,
        status: 'pending',
        note: 'Request submitted — received and under staff review',
      },
    });

    // Notify the requester that the request was received (in-app notification).
    try {
      await alertsService.notify(
        requesterId,
        'Care Request Received',
        'Your request has been received and is under review by our staff team.',
      );
    } catch {
      // Notification failure must not break request creation.
    }

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
  async getCertifiedPartners(
    requestType?: string,
  ): Promise<Pick<Partner, 'id' | 'name' | 'type' | 'contactEmail' | 'address' | 'lat' | 'lng'>[]> {
    // Medical requests only show vet clinics; grooming only shows salons.
    const partnerType = requestType ? PARTNER_TYPE_FOR_REQUEST[requestType] : undefined;
    return prisma.partner.findMany({
      where: { verified: true, ...(partnerType ? { type: partnerType } : {}) },
      select: {
        id: true,
        name: true,
        type: true,
        contactEmail: true,
        address: true,
        lat: true,
        lng: true,
      },
    });
  }

  /**
   * The requester's own medical/grooming requests, newest first, with the
   * cat and assigned partner for display on the profile page.
   */
  async getMyRequests(requesterId: string) {
    return prisma.medicalRequest.findMany({
      where: { requesterId },
      orderBy: { createdAt: 'desc' },
      include: {
        cat: { select: { id: true, name: true, photoUrl: true } },
        partner: { select: { id: true, name: true, type: true, address: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  /** One request with its full stage trail — only the requester may view it. */
  async getRequestDetail(requestId: string, requesterId: string) {
    const request = await prisma.medicalRequest.findUnique({
      where: { id: requestId },
      include: {
        cat: { select: { id: true, name: true, photoUrl: true } },
        partner: { select: { id: true, name: true, type: true, address: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!request || request.requesterId !== requesterId) {
      throw new MedicalRequestNotFoundError();
    }
    return request;
  }

  /**
   * The owner picks the certified location they want to bring the cat to
   * (awaiting_owner → pending_review). Partner type must match the request
   * type and the caller must be the requester.
   */
  async choosePartner(requestId: string, requesterId: string, partnerId: string): Promise<void> {
    const request = await this.getRequestOrThrow(requestId);
    if (request.requesterId !== requesterId) {
      throw new MedicalRequestNotFoundError();
    }
    if (request.status !== 'awaiting_owner') {
      throw new Error('Request is not awaiting a location choice');
    }
    const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner || !partner.verified) {
      throw new Error('Partner not found or not certified');
    }
    if (partner.type !== PARTNER_TYPE_FOR_REQUEST[request.type]) {
      throw new Error(
        request.type === 'medical'
          ? 'Medical requests must use a certified vet clinic'
          : 'Grooming requests must use a certified grooming salon',
      );
    }
    await signalOwnerChosePartner(requestId, partnerId);
  }

  private async getRequestOrThrow(requestId: string): Promise<PrismaMedicalRequest> {
    const request = await prisma.medicalRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new MedicalRequestNotFoundError();
    return request;
  }

  /**
   * Staff approve the request (Req 9.5). The workflow then moves it to
   * 'awaiting_owner' — the OWNER chooses the location, not staff.
   */
  async approveRequest(requestId: string): Promise<void> {
    await this.getRequestOrThrow(requestId);
    await signalStaffDecision(requestId, { approved: true });
  }

  /**
   * Staff rejects the request with a reason (Req 9.7). The workflow persists
   * the reason and includes it in the user notification.
   */
  async rejectRequest(requestId: string, reason: string): Promise<void> {
    await this.getRequestOrThrow(requestId);
    await signalStaffDecision(requestId, { approved: false, reason });
  }

  /** Partner accepts the assignment — moves the workflow to in_progress. */
  async partnerAccept(requestId: string): Promise<void> {
    await this.getRequestOrThrow(requestId);
    await signalPartnerAccepted(requestId);
  }

  /**
   * If both sides' proof is now present, signal the workflow to verify and
   * reimburse (or the rejected → reimbursed resubmission path).
   */
  private async signalIfComplete(requestId: string, resubmission: boolean): Promise<boolean> {
    const request = await this.getRequestOrThrow(requestId);
    if (!request.invoiceUrl || !request.receiptUrl) return false;
    const docs = {
      invoiceUrl: request.invoiceUrl,
      receiptUrl: request.receiptUrl,
      amountCents: request.amountCents,
    };
    if (resubmission) {
      await signalDocumentsResubmitted(requestId, docs);
    } else {
      await signalServiceCompleted(requestId, docs);
    }
    return true;
  }

  /**
   * The USER's side of completion proof (Req 9.8): receipt of their own
   * payment plus in-clinic photos documenting the visit. Verification only
   * proceeds once the partner's proof (invoice) also arrives.
   */
  async submitUserReceipt(
    requestId: string,
    requesterId: string,
    receipt: { buffer: Buffer; originalName: string },
    photos: Array<{ buffer: Buffer; originalName: string }>,
    amountCents: number,
    resubmission: boolean,
  ): Promise<{ receiptUrl: string; verificationStarted: boolean }> {
    const request = await this.getRequestOrThrow(requestId);
    if (request.requesterId !== requesterId) {
      throw new MedicalRequestNotFoundError();
    }

    const receiptUrl = await this.documentStorage.storeDocument(
      receipt.buffer,
      receipt.originalName,
      requestId,
    );
    const photoUrls: string[] = [];
    for (const photo of photos) {
      photoUrls.push(
        await this.documentStorage.storeDocument(photo.buffer, photo.originalName, requestId),
      );
    }

    await prisma.medicalRequest.update({
      where: { id: requestId },
      data: {
        receiptUrl,
        amountCents,
        documents: [...request.documents, receiptUrl, ...photoUrls],
      },
    });
    await prisma.medicalRequestEvent.create({
      data: {
        requestId,
        status: request.status,
        note: `Owner submitted receipt (RM ${(amountCents / 100).toFixed(2)}) and ${photoUrls.length} photo(s) — waiting for the partner's proof`,
      },
    });

    const verificationStarted = await this.signalIfComplete(requestId, resubmission);
    if (!verificationStarted) {
      try {
        await alertsService.notify(
          requesterId,
          'Documents Received',
          'Your receipt and photos were received. We are waiting for the clinic\'s proof to verify the service.',
        );
      } catch {
        // Non-fatal.
      }
    }
    return { receiptUrl, verificationStarted };
  }

  /**
   * The PARTNER's side of completion proof, entered by staff on the clinic's
   * behalf (partners have no login). Triggers verification once the user's
   * receipt is also present.
   */
  async submitPartnerInvoice(
    requestId: string,
    invoice: { buffer: Buffer; originalName: string },
    resubmission: boolean,
  ): Promise<{ invoiceUrl: string; verificationStarted: boolean }> {
    const request = await this.getRequestOrThrow(requestId);

    const invoiceUrl = await this.documentStorage.storeDocument(
      invoice.buffer,
      invoice.originalName,
      requestId,
    );
    await prisma.medicalRequest.update({
      where: { id: requestId },
      data: { invoiceUrl, documents: [...request.documents, invoiceUrl] },
    });
    await prisma.medicalRequestEvent.create({
      data: {
        requestId,
        status: request.status,
        note: 'Partner proof (invoice) received from the clinic',
      },
    });

    const verificationStarted = await this.signalIfComplete(requestId, resubmission);
    return { invoiceUrl, verificationStarted };
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
    amountCents: number,
    photos: Array<{ buffer: Buffer; originalName: string }> = [],
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
    // Optional in-clinic photos documenting the visit.
    const photoUrls: string[] = [];
    for (const photo of photos) {
      photoUrls.push(
        await this.documentStorage.storeDocument(photo.buffer, photo.originalName, requestId),
      );
    }

    await prisma.medicalRequest.update({
      where: { id: requestId },
      data: {
        invoiceUrl,
        receiptUrl,
        documents: [...request.documents, invoiceUrl, receiptUrl, ...photoUrls],
      },
    });

    const docs = { invoiceUrl, receiptUrl, amountCents };
    if (resubmission) {
      await signalDocumentsResubmitted(requestId, docs);
    } else {
      await signalServiceCompleted(requestId, docs);
    }

    return { invoiceUrl, receiptUrl };
  }
}
