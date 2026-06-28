import { PrismaClient } from '@prisma/client';
import { GamificationService } from '../../modules/gamification/gamification.service';
import { AlertsService } from '../../modules/alerts/alerts.service';

const prisma = new PrismaClient();
const alertsService = new AlertsService();
const gamificationService = new GamificationService(prisma, alertsService);

export interface VerifyRequestResult {
  approved: boolean;
  partnerId?: string;
  reason?: string;
}

export interface VerifyInvoiceResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify a medical request via Staff-Verification.
 * Returns approval status and assigned partner.
 *
 * Requirement 9.3: Staff verifies request validity before proceeding.
 */
export async function verifyRequest(requestId: string): Promise<VerifyRequestResult> {
  const request = await prisma.medicalRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    return { approved: false, reason: 'Request not found' };
  }

  // In production, this would integrate with an external staff verification queue.
  // For now, we check if a partnerId has been assigned (staff approved and assigned partner).
  if (request.partnerId && request.status === 'verified') {
    return { approved: true, partnerId: request.partnerId };
  }

  // If status is still pending, poll or wait for staff action.
  // In a real system, this activity would block until staff completes review.
  // Here we check the current DB state.
  const updatedRequest = await prisma.medicalRequest.findUnique({
    where: { id: requestId },
  });

  if (updatedRequest?.status === 'verified' && updatedRequest.partnerId) {
    return { approved: true, partnerId: updatedRequest.partnerId };
  }

  return { approved: false, reason: 'Request not approved by staff' };
}

/**
 * Notify a partner about a new medical request assignment.
 *
 * Requirement 9.4: Partner is notified of assigned request.
 */
export async function notifyPartner(partnerId: string, requestId: string): Promise<void> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new Error(`Partner ${partnerId} not found`);
  }

  // In production: send email/push to partner
  // For now, this is a placeholder that would integrate with notification service
  console.log(`Notified partner ${partner.name} (${partner.contactEmail}) about request ${requestId}`);
}

/**
 * Update the status of a medical request in the database.
 *
 * Requirement 9.5, 9.6, 9.7: Status transitions through workflow lifecycle.
 */
export async function updateMedicalRequestStatus(
  requestId: string,
  status: string,
  partnerId?: string,
): Promise<void> {
  const data: { status: string; partnerId?: string } = { status };
  if (partnerId) {
    data.partnerId = partnerId;
  }

  await prisma.medicalRequest.update({
    where: { id: requestId },
    data,
  });
}

/**
 * Verify an invoice/receipt submitted by the partner or user.
 * Staff validates the invoice documents.
 *
 * Requirement 9.6: Invoice verification before reimbursement.
 */
export async function verifyInvoice(invoiceUrl: string): Promise<VerifyInvoiceResult> {
  // In production: staff reviews the invoice via a verification queue
  // This would check document validity, amount ranges, partner legitimacy, etc.
  if (!invoiceUrl || invoiceUrl.trim() === '') {
    return { valid: false, reason: 'No invoice URL provided' };
  }

  // Placeholder: in real implementation, this blocks until staff verifies
  return { valid: true };
}

/**
 * Release reimbursement funds from the community pool to cover medical costs.
 *
 * Requirement 9.7: Funds released after invoice verification.
 */
export async function releaseReimbursement(
  catId: string,
  amountCents: number,
  requestId: string,
): Promise<void> {
  if (amountCents <= 0) {
    throw new Error('Reimbursement amount must be positive');
  }

  // In production: debit from the community pool/wallet for this cat
  // For now, log the operation
  console.log(
    `Released ${amountCents} cents for cat ${catId}, request ${requestId}`,
  );
}

/**
 * Award XP to the requester for a successful medical reimbursement.
 *
 * Requirement 9.8: XP awarded upon successful reimbursement.
 */
export async function awardXP(
  userId: string,
  actionType: string,
  _amount: number,
): Promise<void> {
  // Use the gamification service to record the action
  // The actionType should be 'medical_reimbursed' which awards 100 XP
  // We need a catId — retrieve from the user's medical requests
  const latestRequest = await prisma.medicalRequest.findFirst({
    where: { requesterId: userId, status: 'reimbursed' },
    orderBy: { createdAt: 'desc' },
  });

  if (latestRequest) {
    await gamificationService.recordAction(
      userId,
      latestRequest.catId,
      actionType as 'medical_reimbursed',
    );
  }
}

/**
 * Send a notification to a specific user.
 */
export async function notifyUser(userId: string, message: string): Promise<void> {
  try {
    await alertsService.notify(userId, 'Medical Request Update', message);
  } catch {
    // Notification failure should not break the workflow
    console.log(`[notification] User ${userId}: ${message}`);
  }
}

/**
 * Notify all Lvl1+ owners of a cat about a medical request update.
 */
export async function notifyOwners(catId: string, message: string): Promise<void> {
  try {
    const owners = await prisma.ownership.findMany({
      where: { catId, level: { gte: 1 } },
      select: { userId: true },
    });

    for (const owner of owners) {
      try {
        await alertsService.notify(owner.userId, 'Medical Request Update', message);
      } catch {
        // Individual notification failure shouldn't stop others
        console.log(`[notification] Owner ${owner.userId}: ${message}`);
      }
    }
  } catch {
    console.log(`[notification] Owners of cat ${catId}: ${message}`);
  }
}
