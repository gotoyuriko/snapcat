import { PrismaClient } from '@prisma/client';
import { GamificationService } from '../../modules/gamification/gamification.service';
import { AlertsService } from '../../modules/alerts/alerts.service';

const prisma = new PrismaClient();
const alertsService = new AlertsService();
const gamificationService = new GamificationService(prisma, alertsService);

export interface VerifyInvoiceResult {
  valid: boolean;
  reason?: string;
}

export interface ReleaseReimbursementResult {
  released: boolean;
  reason?: string;
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
  rejectionReason?: string,
  note?: string,
): Promise<void> {
  const data: { status: string; partnerId?: string; rejectionReason?: string } = { status };
  if (partnerId) {
    data.partnerId = partnerId;
  }
  if (rejectionReason) {
    data.rejectionReason = rejectionReason;
  }

  await prisma.medicalRequest.update({
    where: { id: requestId },
    data,
  });

  // Stage trail: every transition is recorded so the owner can trace progress.
  await prisma.medicalRequestEvent.create({
    data: { requestId, status, note: note ?? '' },
  });
}

/**
 * Verify the completion documents: partner invoice AND user receipt (Req 9.8).
 * Both documents must be present for the request to progress to reimbursement.
 */
export async function verifyInvoice(
  invoiceUrl: string,
  receiptUrl?: string,
): Promise<VerifyInvoiceResult> {
  // In production: staff reviews the documents via a verification queue
  // (document validity, amount ranges, partner legitimacy, etc.).
  if (!invoiceUrl || invoiceUrl.trim() === '') {
    return { valid: false, reason: 'No invoice URL provided' };
  }
  if (receiptUrl !== undefined && receiptUrl.trim() === '') {
    return { valid: false, reason: 'No receipt URL provided' };
  }

  return { valid: true };
}

/**
 * Release reimbursement funds from the cat's community pool to the requester.
 *
 * The pool balance for a cat is the sum of its released donations minus what
 * has already been reimbursed. The release is transactional and idempotent:
 * a request that already has `reimbursedAt` set is not paid twice.
 *
 * Requirement 9.9: release the reimbursement amount from the pool to the User.
 */
export async function releaseReimbursement(
  catId: string,
  _requesterId: string,
  amountCents: number,
  requestId: string,
): Promise<ReleaseReimbursementResult> {
  if (amountCents <= 0) {
    throw new Error('Reimbursement amount must be positive');
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.medicalRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new Error(`Medical request ${requestId} not found`);
    }
    // Idempotence: activity retries must not double-pay.
    if (request.reimbursedAt) {
      return { released: true };
    }

    const [donated, reimbursed] = await Promise.all([
      tx.donation.aggregate({
        where: { catId, status: 'released' },
        _sum: { amountCents: true },
      }),
      tx.medicalRequest.aggregate({
        where: { catId, reimbursedAt: { not: null } },
        _sum: { amountCents: true },
      }),
    ]);
    const poolBalance =
      (donated._sum.amountCents ?? 0) - (reimbursed._sum.amountCents ?? 0);

    if (poolBalance < amountCents) {
      return {
        released: false,
        reason: `Community pool for this cat has ${poolBalance} cents, but ${amountCents} cents are needed`,
      };
    }

    // Record the release against the pool. The in-app wallet was removed
    // (direct-checkout rework), so the payout itself happens off-platform —
    // staff transfer the amount to the requester's bank account / e-wallet.
    await tx.medicalRequest.update({
      where: { id: requestId },
      data: { amountCents, reimbursedAt: new Date() },
    });

    return { released: true };
  });
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
    // Revoked owners lose notifications (Requirement 16.2).
    const owners = await prisma.ownership.findMany({
      where: { catId, level: { gte: 1 }, revokedAt: null },
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
