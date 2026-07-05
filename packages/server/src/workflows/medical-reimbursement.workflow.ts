/**
 * Medical Reimbursement Temporal Workflow
 *
 * Lifecycle (each transition is persisted as a MedicalRequestEvent and
 * notified to the owner):
 * 1. pending          — staff review the request (approve/reject)
 * 2. awaiting_owner   — approved; the owner picks a certified location
 * 3. pending_review   — staff arrange cooperation with the chosen clinic
 * 4. in_progress      — clinic agreed; date arranged via personal contact,
 *                       service must complete within 30 days
 * 5. reimbursed       — receipt + partner proof verified, funds released
 *    (or rejected / timed_out)
 *
 * Requirements: 9.1–9.13 (owner-choice flow supersedes staff assignment)
 * Uses workflowId = requestId for idempotence.
 */

import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
} from '@temporalio/workflow';

import type * as activities from './activities/medical-reimbursement.activities';

// Proxy activities with retry policy
const {
  notifyPartner,
  updateMedicalRequestStatus,
  verifyInvoice,
  releaseReimbursement,
  awardXP,
  notifyUser,
  notifyOwners,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 3,
  },
});

/** Terminal statuses for the workflow */
export type WorkflowStatus =
  | 'rejected'
  | 'timed_out'
  | 'reimbursed';

/** Signal: staff has reviewed the request (Req 9.5–9.7). */
export interface StaffDecision {
  approved: boolean;
  /** Req 9.7: staff-supplied reason, relayed to the user on rejection. */
  reason?: string;
}
export const staffDecisionSignal = defineSignal<[StaffDecision]>('staffDecision');

/** Signal: the owner picked a certified partner location (awaiting_owner stage). */
export const ownerChosePartnerSignal = defineSignal<[string]>('ownerChosePartner');

/** Signal: the chosen clinic agreed to cooperate (staff-entered). */
export const partnerAcceptedSignal = defineSignal('partnerAccepted');

/**
 * Completion documents (Req 9.8): user receipt + in-clinic photos, plus the
 * partner invoice/proof (staff-entered) and the invoiced amount to reimburse.
 * A bare string (legacy payload) is treated as the invoice URL.
 */
export interface CompletionDocs {
  invoiceUrl: string;
  receiptUrl?: string;
  amountCents?: number;
}
export type CompletionPayload = CompletionDocs | string;

/** Signal: service has been completed with the documentation set */
export const serviceCompletedSignal = defineSignal<[CompletionPayload]>('serviceCompleted');

/** Signal: documents resubmitted after rejection (allows rejected → reimbursed transition) */
export const documentsResubmittedSignal = defineSignal<[CompletionPayload]>('documentsResubmitted');

function normalizeCompletionPayload(payload: CompletionPayload): CompletionDocs {
  return typeof payload === 'string' ? { invoiceUrl: payload } : payload;
}

/** Fallback reimbursement amount when the submission carries no invoiced amount. */
const DEFAULT_REIMBURSEMENT_CENTS = 5000;

/** The service must be completed within 30 days of the clinic agreeing. */
const SERVICE_COMPLETION_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Medical Reimbursement Workflow
 *
 * @param requestId - The medical request ID (also used as workflowId for idempotence)
 * @param requesterId - The user who created the request
 * @param catId - The cat associated with this request
 * @returns Terminal status of the workflow
 */
export async function medicalReimbursementWorkflow(
  requestId: string,
  requesterId: string,
  catId: string,
): Promise<WorkflowStatus> {
  // --- Workflow state (signals set these) ---
  let staffDecided = false;
  let staffDecision: StaffDecision = { approved: false };
  let chosenPartnerId = '';
  let partnerAccepted = false;
  let serviceCompleted = false;
  let completionDocs: CompletionDocs = { invoiceUrl: '' };
  let resubmittedDocs: CompletionDocs = { invoiceUrl: '' };
  let documentsResubmitted = false;

  // --- Register signal handlers ---
  setHandler(staffDecisionSignal, (decision: StaffDecision) => {
    staffDecided = true;
    staffDecision = decision;
  });

  setHandler(ownerChosePartnerSignal, (partnerId: string) => {
    chosenPartnerId = partnerId;
  });

  setHandler(partnerAcceptedSignal, () => {
    partnerAccepted = true;
  });

  setHandler(serviceCompletedSignal, (payload: CompletionPayload) => {
    serviceCompleted = true;
    completionDocs = normalizeCompletionPayload(payload);
  });

  setHandler(documentsResubmittedSignal, (payload: CompletionPayload) => {
    documentsResubmitted = true;
    resubmittedDocs = normalizeCompletionPayload(payload);
  });

  // --- Stage 1: Staff review (status 'pending', Req 9.5) ---
  await condition(() => staffDecided);

  if (!staffDecision.approved) {
    const reason = staffDecision.reason || 'No reason provided';
    await updateMedicalRequestStatus(requestId, 'rejected', undefined, reason,
      `Rejected by staff review: ${reason}`);
    await notifyUser(
      requesterId,
      `Your care request has been rejected by staff review. Reason: ${reason}`,
    );
    return 'rejected';
  }

  // --- Stage 2: Awaiting owner's choice of location ---
  await updateMedicalRequestStatus(requestId, 'awaiting_owner', undefined, undefined,
    'Approved by staff — waiting for the owner to choose a certified location');
  await notifyUser(
    requesterId,
    'Your care request has been approved! Action needed: open the request and choose ' +
      'the certified location you want to bring your cat to.',
  );

  await condition(() => chosenPartnerId !== '');

  // --- Stage 3: Staff arrange with the chosen clinic ---
  await updateMedicalRequestStatus(requestId, 'pending_review', chosenPartnerId, undefined,
    'Owner chose a location — staff are arranging cooperation with the clinic');
  await notifyUser(
    requesterId,
    'Location received. Our team is now arranging the service with your chosen partner — ' +
      'we will notify you once they agree.',
  );
  await notifyPartner(chosenPartnerId, requestId);

  await condition(() => partnerAccepted);

  // --- Stage 4: In progress (30-day service window) ---
  await updateMedicalRequestStatus(requestId, 'in_progress', undefined, undefined,
    'Clinic agreed to cooperate — service must be completed within 30 days');
  await notifyOwners(
    catId,
    'The clinic has agreed to cooperate! The team, you and the partner will arrange the ' +
      'date through personal contact. Please complete the visit within 30 days, pay ' +
      'up-front, and keep your receipt and photos from the clinic.',
  );

  const serviceCompletedInTime = await condition(
    () => serviceCompleted,
    SERVICE_COMPLETION_TIMEOUT_MS,
  );

  if (!serviceCompletedInTime) {
    await updateMedicalRequestStatus(requestId, 'timed_out', undefined, undefined,
      'Service was not completed within the 30-day window');
    await notifyUser(
      requesterId,
      'Your care request has timed out. The service was not completed within the 30-day window.',
    );
    return 'timed_out';
  }

  // --- Stage 5: Verify documentation (user receipt + partner proof, Req 9.8) ---
  const invoiceResult = await verifyInvoice(completionDocs.invoiceUrl, completionDocs.receiptUrl);

  if (!invoiceResult.valid) {
    // Documentation invalid — reject but allow re-submission
    await updateMedicalRequestStatus(requestId, 'rejected', undefined,
      invoiceResult.reason || 'Documentation invalid',
      'Documentation rejected during verification — resubmission allowed');
    await notifyUser(
      requesterId,
      'Your documentation was rejected. Please resubmit valid documents to proceed with reimbursement.',
    );

    const resubmittedInTime = await condition(
      () => documentsResubmitted,
      SERVICE_COMPLETION_TIMEOUT_MS,
    );

    if (!resubmittedInTime) {
      return 'rejected';
    }

    const resubmitResult = await verifyInvoice(resubmittedDocs.invoiceUrl, resubmittedDocs.receiptUrl);

    if (!resubmitResult.valid) {
      await notifyUser(requesterId, 'Your resubmitted documents were also rejected. The request is closed.');
      return 'rejected';
    }

    // Resubmitted documents are valid — proceed to reimbursement (rejected → reimbursed)
    completionDocs = resubmittedDocs;
  }

  // --- Stage 6: Release reimbursement from the cat's community pool (Req 9.9) ---
  const reimbursementAmountCents =
    completionDocs.amountCents && completionDocs.amountCents > 0
      ? completionDocs.amountCents
      : DEFAULT_REIMBURSEMENT_CENTS;

  const release = await releaseReimbursement(
    catId,
    requesterId,
    reimbursementAmountCents,
    requestId,
  );

  if (release && release.released === false) {
    const reason = release.reason || 'Insufficient community pool funds';
    await updateMedicalRequestStatus(requestId, 'rejected', undefined, reason,
      `Reimbursement could not be released: ${reason}`);
    await notifyUser(
      requesterId,
      `Your reimbursement could not be released: ${reason}`,
    );
    return 'rejected';
  }

  // Award XP to the requester
  await awardXP(requesterId, 'medical_reimbursed', 100);

  // Update final status
  await updateMedicalRequestStatus(requestId, 'reimbursed', undefined, undefined,
    'Documentation verified on both sides — reimbursement sent to your wallet');
  await notifyOwners(catId, 'Care contribution confirmed — the reimbursement has been sent to the requester\'s wallet!');

  return 'reimbursed';
}
