/**
 * Temporal Worker Setup
 *
 * Registers all workflows and activities with the Temporal server.
 * Run this as a separate process alongside the API server.
 *
 * Usage: ts-node src/workflows/worker.ts
 */

import { Worker, NativeConnection } from '@temporalio/worker';
import { config } from '../config';
import path from 'path';

const MEDICAL_TASK_QUEUE_NAME = 'codingkitty-medical';
const DONATION_TASK_QUEUE_NAME = 'codingkitty-donation';

/**
 * Creates and starts a Temporal worker that handles:
 * - Medical Reimbursement Workflow
 * - Donation Escrow Workflow
 */
export async function runWorker(): Promise<void> {
  const connection = await NativeConnection.connect({
    address: config.temporal.address,
  });

  // Medical Reimbursement Worker
  const medicalWorker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: MEDICAL_TASK_QUEUE_NAME,
    workflowsPath: path.resolve(__dirname, './medical-reimbursement.workflow'),
    activities: require('./activities/medical-reimbursement.activities'),
  });

  // Donation Escrow Worker
  const donationWorker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: DONATION_TASK_QUEUE_NAME,
    workflowsPath: path.resolve(__dirname, './donation-escrow.workflow'),
    activities: require('./activities/donation-escrow.activities'),
  });

  console.log(`Temporal workers started on task queues: ${MEDICAL_TASK_QUEUE_NAME}, ${DONATION_TASK_QUEUE_NAME}`);

  // Run both workers concurrently
  await Promise.all([medicalWorker.run(), donationWorker.run()]);
}

/** Task queue names exported for use by the client */
export const MEDICAL_TASK_QUEUE = MEDICAL_TASK_QUEUE_NAME;
export const DONATION_TASK_QUEUE = DONATION_TASK_QUEUE_NAME;

// Run worker if executed directly
if (require.main === module) {
  runWorker().catch((err) => {
    console.error('Temporal worker failed:', err);
    process.exit(1);
  });
}
