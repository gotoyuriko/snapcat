/**
 * Temporal Client
 *
 * Provides a singleton Temporal client for starting and signaling workflows.
 * Used by the API layer to interact with running workflows.
 */

import { Client, Connection, WorkflowHandle } from '@temporalio/client';
import { config } from '../config';
import { MEDICAL_TASK_QUEUE, DONATION_TASK_QUEUE } from './worker';
import {
  medicalReimbursementWorkflow,
  partnerAcceptedSignal,
  serviceCompletedSignal,
  documentsResubmittedSignal,
} from './medical-reimbursement.workflow';
import { donationEscrowWorkflow } from './donation-escrow.workflow';

let clientInstance: Client | null = null;

/**
 * Get or create the singleton Temporal client.
 */
export async function getTemporalClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }

  const connection = await Connection.connect({
    address: config.temporal.address,
  });

  clientInstance = new Client({
    connection,
    namespace: config.temporal.namespace,
  });

  return clientInstance;
}

/**
 * Start the Medical Reimbursement workflow.
 * Uses requestId as workflowId for idempotence — re-starting with the same
 * requestId will not create a duplicate workflow.
 *
 * Requirement 15.4: Idempotent workflow start via workflowId = requestId.
 */
export async function startMedicalReimbursementWorkflow(
  requestId: string,
  requesterId: string,
  catId: string,
): Promise<string> {
  const client = await getTemporalClient();

  const handle = await client.workflow.start(medicalReimbursementWorkflow, {
    taskQueue: MEDICAL_TASK_QUEUE,
    workflowId: requestId, // Idempotence key
    args: [requestId, requesterId, catId],
  });

  return handle.workflowId;
}

/**
 * Signal a running workflow that the partner has accepted.
 */
export async function signalPartnerAccepted(workflowId: string): Promise<void> {
  const client = await getTemporalClient();
  const handle: WorkflowHandle = client.workflow.getHandle(workflowId);
  await handle.signal(partnerAcceptedSignal);
}

/**
 * Signal a running workflow that service is completed with invoice.
 */
export async function signalServiceCompleted(
  workflowId: string,
  invoiceUrl: string,
): Promise<void> {
  const client = await getTemporalClient();
  const handle: WorkflowHandle = client.workflow.getHandle(workflowId);
  await handle.signal(serviceCompletedSignal, invoiceUrl);
}

/**
 * Signal a running workflow that documents have been resubmitted after rejection.
 * Enables the rejected → reimbursed transition.
 */
export async function signalDocumentsResubmitted(
  workflowId: string,
  invoiceUrl: string,
): Promise<void> {
  const client = await getTemporalClient();
  const handle: WorkflowHandle = client.workflow.getHandle(workflowId);
  await handle.signal(documentsResubmittedSignal, invoiceUrl);
}


/**
 * Start the Donation Escrow workflow.
 * Uses donationId as workflowId for idempotence — re-starting with the same
 * donationId will not create a duplicate workflow.
 *
 * Requirement 10.5, 10.6: Escrow workflow for food donations.
 */
export async function startDonationEscrowWorkflow(
  donationId: string,
  donorId: string,
  catId: string,
  amountCents: number,
): Promise<string> {
  const client = await getTemporalClient();

  const handle = await client.workflow.start(donationEscrowWorkflow, {
    taskQueue: DONATION_TASK_QUEUE,
    workflowId: donationId, // Idempotence key
    args: [donationId, donorId, catId, amountCents, config.donation.escrowHold],
  });

  return handle.workflowId;
}
