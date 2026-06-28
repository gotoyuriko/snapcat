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

const TASK_QUEUE = 'codingkitty-medical';

/**
 * Creates and starts a Temporal worker that handles:
 * - Medical Reimbursement Workflow
 * - Donation Escrow Workflow (future)
 */
export async function runWorker(): Promise<void> {
  const connection = await NativeConnection.connect({
    address: config.temporal.address,
  });

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: TASK_QUEUE,
    // Workflows are loaded from a separate bundle (Temporal requirement)
    workflowsPath: path.resolve(__dirname, './medical-reimbursement.workflow'),
    // Activities are registered directly
    activities: require('./activities/medical-reimbursement.activities'),
  });

  console.log(`Temporal worker started on task queue: ${TASK_QUEUE}`);
  await worker.run();
}

/** Task queue name exported for use by the client */
export const MEDICAL_TASK_QUEUE = TASK_QUEUE;

// Run worker if executed directly
if (require.main === module) {
  runWorker().catch((err) => {
    console.error('Temporal worker failed:', err);
    process.exit(1);
  });
}
