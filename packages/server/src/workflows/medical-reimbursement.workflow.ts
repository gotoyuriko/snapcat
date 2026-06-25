/**
 * TODO: Implement Medical Reimbursement Temporal Workflow
 *
 * Workflow steps:
 * 1. Start: Medical request created → wait for approval
 * 2. Signal: Partner approves request → status = approved
 * 3. Signal: User uploads receipt documents
 * 4. Signal: Partner confirms treatment completion → status = completed
 * 5. Activity: Calculate reimbursement amount
 * 6. Activity: Process reimbursement to user's wallet
 * 7. End: Workflow completes
 *
 * Timeouts:
 * - 48h for approval (auto-escalate if not approved)
 * - 30d for treatment completion
 */

export async function medicalReimbursementWorkflow(_requestId: string): Promise<void> {
  // TODO: Implement Temporal workflow with signals and activities
  throw new Error('Not implemented');
}
