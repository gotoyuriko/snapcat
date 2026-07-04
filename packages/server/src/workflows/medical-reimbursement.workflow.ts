/**
 * Medical Reimbursement Temporal Workflow
 *
 * Implements the full medical reimbursement state machine:
 * 1. verifyRequest (Staff-Verification) → approve or reject
 * 2. notifyPartner → partner accepts
 * 3. awaitServiceCompletion (7-day timeout) → service done with invoice
 * 4. verifyInvoice → valid or invalid
 * 5. releaseReimbursement / reject (with re-submission support)
 *
 * Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 15.4
 *
 * Uses workflowId = requestId for idempotence.
 * Resumes from last checkpoint on retry (Temporal event sourcing).
 */

import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
  sleep,
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
  partnerId?: string;
  appointmentDetails?: string;
}
export const staffDecisionSignal = defineSignal<[StaffDecision]>('staffDecision');

/** Signal: partner has accepted the medical request */
export const partnerAcceptedSignal = defineSignal('partnerAccepted');

/** Signal: service has been completed with invoice */
export const serviceCompletedSignal = defineSignal<[string]>('serviceCompleted');

/** Signal: documents resubmitted after rejection (allows rejected → reimbursed transition) */
export const documentsResubmittedSignal = defineSignal<[string]>('documentsResubmitted');

/** 7-day timeout for service completion (in milliseconds) */
const SERVICE_COMPLETION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
  let partnerAccepted = false;
  let serviceCompleted = false;
  let invoiceUrl = '';
  let resubmittedInvoiceUrl = '';
  let documentsResubmitted = false;

  // --- Register signal handlers ---
  setHandler(staffDecisionSignal, (decision: StaffDecision) => {
    staffDecided = true;
    staffDecision = decision;
  });

  setHandler(partnerAcceptedSignal, () => {
    partnerAccepted = true;
  });

  setHandler(serviceCompletedSignal, (url: string) => {
    serviceCompleted = true;
    invoiceUrl = url;
  });

  setHandler(documentsResubmittedSignal, (url: string) => {
    documentsResubmitted = true;
    resubmittedInvoiceUrl = url;
  });

  // --- Step 1: Staff Verification (Req 9.5) ---
  // Wait for the review team's decision signal (POST /:id/approve|reject).
  // The request stays 'pending' until staff act — never auto-rejected.
  await condition(() => staffDecided);

  if (!staffDecision.approved) {
    // Rejected by staff
    await updateMedicalRequestStatus(requestId, 'rejected');
    await notifyUser(requesterId, 'Your medical request has been rejected by staff verification.');
    return 'rejected';
  }

  // Approved — update status to verified
  await updateMedicalRequestStatus(requestId, 'verified', staffDecision.partnerId);

  // --- Step 2: Confirm to requester and partner (Req 9.6) ---
  await notifyUser(
    requesterId,
    `Your medical request has been approved.${
      staffDecision.appointmentDetails ? ` Appointment: ${staffDecision.appointmentDetails}` : ''
    }`,
  );
  if (staffDecision.partnerId) {
    await notifyPartner(staffDecision.partnerId, requestId);
  }

  // --- Step 3: Wait for partner acceptance signal ---
  await condition(() => partnerAccepted);

  // Update status to in_progress
  await updateMedicalRequestStatus(requestId, 'in_progress');
  await notifyOwners(catId, 'Your cat\'s medical request is now in progress with the assigned partner.');

  // --- Step 4: Wait for service completion (7-day timeout) ---
  const serviceCompletedInTime = await condition(
    () => serviceCompleted,
    SERVICE_COMPLETION_TIMEOUT_MS,
  );

  if (!serviceCompletedInTime) {
    // Timed out waiting for service completion
    await updateMedicalRequestStatus(requestId, 'timed_out');
    await notifyUser(requesterId, 'Your medical request has timed out. The service was not completed within the 7-day window.');
    return 'timed_out';
  }

  // --- Step 5: Verify invoice ---
  const invoiceResult = await verifyInvoice(invoiceUrl);

  if (!invoiceResult.valid) {
    // Invoice invalid — reject but allow re-submission
    await updateMedicalRequestStatus(requestId, 'rejected');
    await notifyUser(
      requesterId,
      'Your invoice was rejected. Please resubmit valid documentation to proceed with reimbursement.',
    );

    // Wait for re-submission signal (allow rejected → reimbursed transition)
    // Give another 7 days for resubmission
    const resubmittedInTime = await condition(
      () => documentsResubmitted,
      SERVICE_COMPLETION_TIMEOUT_MS,
    );

    if (!resubmittedInTime) {
      // No resubmission within timeout — stay rejected
      return 'rejected';
    }

    // Verify the resubmitted invoice
    const resubmitResult = await verifyInvoice(resubmittedInvoiceUrl);

    if (!resubmitResult.valid) {
      // Still invalid — final rejection
      await notifyUser(requesterId, 'Your resubmitted documents were also rejected. The request is closed.');
      return 'rejected';
    }

    // Resubmitted invoice is valid — proceed to reimbursement (rejected → reimbursed)
    invoiceUrl = resubmittedInvoiceUrl;
  }

  // --- Step 6: Release reimbursement ---
  // For now, use a standard reimbursement amount (in production, parsed from invoice)
  const reimbursementAmountCents = 5000; // Placeholder — would be extracted from verified invoice

  await releaseReimbursement(catId, reimbursementAmountCents, requestId);

  // Award XP to the requester
  await awardXP(requesterId, 'medical_reimbursed', 100);

  // Update final status
  await updateMedicalRequestStatus(requestId, 'reimbursed');
  await notifyOwners(catId, 'Medical reimbursement has been processed successfully!');

  return 'reimbursed';
}
