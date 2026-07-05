/**
 * Property 6: Temporal workflow idempotence (Medical Reimbursement)
 *
 * **Validates: Requirements 9.1, 14.4**
 *
 * For any MedicalReimbursementWorkflow execution, re-running the workflow
 * with the same inputs and signal sequence produces the same terminal status
 * and the same financial amounts (releaseReimbursement, awardXP).
 *
 * This validates that the workflow is deterministic given the same inputs and signals.
 */

import * as fc from 'fast-check';

// --- Activity mocks ---
const mockVerifyRequest = jest.fn();
const mockNotifyPartner = jest.fn();
const mockUpdateMedicalRequestStatus = jest.fn();
const mockVerifyInvoice = jest.fn();
const mockReleaseReimbursement = jest.fn();
const mockAwardXP = jest.fn();
const mockNotifyUser = jest.fn();
const mockNotifyOwners = jest.fn();

// --- Temporal SDK mock infrastructure ---
let signalHandlers: Record<string, (...args: any[]) => void> = {};
let conditionCallbacks: Array<{
  fn: () => boolean;
  timeout?: number;
  resolve: (v: boolean) => void;
}> = [];

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    verifyRequest: mockVerifyRequest,
    notifyPartner: mockNotifyPartner,
    updateMedicalRequestStatus: mockUpdateMedicalRequestStatus,
    verifyInvoice: mockVerifyInvoice,
    releaseReimbursement: mockReleaseReimbursement,
    awardXP: mockAwardXP,
    notifyUser: mockNotifyUser,
    notifyOwners: mockNotifyOwners,
  }),
  defineSignal: (name: string) => name,
  setHandler: (signalName: string, handler: (...args: any[]) => void) => {
    signalHandlers[signalName] = handler;
  },
  condition: async (fn: () => boolean, timeout?: number) => {
    if (fn()) return true;
    return new Promise<boolean>((resolve) => {
      conditionCallbacks.push({ fn, timeout, resolve });
    });
  },
  sleep: async (_duration: string) => {},
}));

// Import after mocks are set up
import { medicalReimbursementWorkflow } from '../../workflows/medical-reimbursement.workflow';

// --- Helpers ---

function simulateSignal(signalName: string, ...args: any[]) {
  if (signalHandlers[signalName]) {
    signalHandlers[signalName](...args);
  }
  const pending = [...conditionCallbacks];
  conditionCallbacks = [];
  for (const cb of pending) {
    if (cb.fn()) {
      cb.resolve(true);
    } else {
      conditionCallbacks.push(cb);
    }
  }
}

function simulateTimeout() {
  const pending = [...conditionCallbacks];
  conditionCallbacks = [];
  for (const cb of pending) {
    if (cb.timeout !== undefined) {
      cb.resolve(false);
    } else {
      conditionCallbacks.push(cb);
    }
  }
}

function resetWorkflowState() {
  signalHandlers = {};
  conditionCallbacks = [];
}

// --- Scenario discriminated union ---

type Scenario =
  | { type: 'staff_rejected' }
  | { type: 'service_timeout' }
  | { type: 'happy_path'; invoiceUrl: string }
  | { type: 'invoice_rejected_no_resubmit'; invoiceUrl: string }
  | { type: 'invoice_rejected_resubmit_valid'; invoiceUrl: string; resubmitUrl: string }
  | { type: 'invoice_rejected_resubmit_invalid'; invoiceUrl: string; resubmitUrl: string };

/**
 * Runs the workflow with the given scenario and captures financial outcomes.
 */
async function runWorkflowWithScenario(
  requestId: string,
  requesterId: string,
  catId: string,
  scenario: Scenario,
  partnerId: string,
): Promise<{
  status: string;
  reimbursementCalls: Array<[string, string, number, string]>;
  xpCalls: Array<[string, string, number]>;
}> {
  // Configure mocks based on scenario
  switch (scenario.type) {
    case 'staff_rejected':
      break;

    case 'service_timeout':
      break;

    case 'happy_path':
      mockVerifyInvoice.mockResolvedValue({ valid: true });
      break;

    case 'invoice_rejected_no_resubmit':
      mockVerifyInvoice.mockResolvedValue({ valid: false, reason: 'Bad invoice' });
      break;

    case 'invoice_rejected_resubmit_valid':
      mockVerifyInvoice
        .mockResolvedValueOnce({ valid: false, reason: 'Bad invoice' })
        .mockResolvedValueOnce({ valid: true });
      break;

    case 'invoice_rejected_resubmit_invalid':
      mockVerifyInvoice.mockResolvedValue({ valid: false, reason: 'Still bad' });
      break;
  }

  // Common mocks
  mockNotifyPartner.mockResolvedValue(undefined);
  mockUpdateMedicalRequestStatus.mockResolvedValue(undefined);
  mockReleaseReimbursement.mockResolvedValue(undefined);
  mockAwardXP.mockResolvedValue(undefined);
  mockNotifyUser.mockResolvedValue(undefined);
  mockNotifyOwners.mockResolvedValue(undefined);

  // Start workflow
  const workflowPromise = medicalReimbursementWorkflow(requestId, requesterId, catId);
  await new Promise((r) => setImmediate(r));

  // Drive the workflow based on scenario
  if (scenario.type === 'staff_rejected') {
    simulateSignal('staffDecision', { approved: false });
    await new Promise((r) => setImmediate(r));
  } else {
    simulateSignal('staffDecision', { approved: true });
    await new Promise((r) => setImmediate(r));
    // New lifecycle: the owner chooses the location after approval.
    simulateSignal('ownerChosePartner', partnerId);
    await new Promise((r) => setImmediate(r));
  }
  switch (scenario.type) {
    case 'staff_rejected':
      break;

    case 'service_timeout':
      // Partner accepts, then service times out
      simulateSignal('partnerAccepted');
      await new Promise((r) => setImmediate(r));
      simulateTimeout();
      await new Promise((r) => setImmediate(r));
      break;

    case 'happy_path':
      simulateSignal('partnerAccepted');
      await new Promise((r) => setImmediate(r));
      simulateSignal('serviceCompleted', scenario.invoiceUrl);
      await new Promise((r) => setImmediate(r));
      break;

    case 'invoice_rejected_no_resubmit':
      simulateSignal('partnerAccepted');
      await new Promise((r) => setImmediate(r));
      simulateSignal('serviceCompleted', scenario.invoiceUrl);
      await new Promise((r) => setImmediate(r));
      // Timeout on resubmission
      simulateTimeout();
      await new Promise((r) => setImmediate(r));
      break;

    case 'invoice_rejected_resubmit_valid':
      simulateSignal('partnerAccepted');
      await new Promise((r) => setImmediate(r));
      simulateSignal('serviceCompleted', scenario.invoiceUrl);
      await new Promise((r) => setImmediate(r));
      simulateSignal('documentsResubmitted', scenario.resubmitUrl);
      await new Promise((r) => setImmediate(r));
      break;

    case 'invoice_rejected_resubmit_invalid':
      simulateSignal('partnerAccepted');
      await new Promise((r) => setImmediate(r));
      simulateSignal('serviceCompleted', scenario.invoiceUrl);
      await new Promise((r) => setImmediate(r));
      simulateSignal('documentsResubmitted', scenario.resubmitUrl);
      await new Promise((r) => setImmediate(r));
      break;
  }

  const status = await workflowPromise;

  // Capture financial call data
  const reimbursementCalls = mockReleaseReimbursement.mock.calls.map(
    (c: any[]) => [c[0], c[1], c[2], c[3]] as [string, string, number, string],
  );
  const xpCalls = mockAwardXP.mock.calls.map(
    (c: any[]) => [c[0], c[1], c[2]] as [string, string, number],
  );

  return { status, reimbursementCalls, xpCalls };
}

// --- Arbitraries ---

const idArb = fc.stringMatching(/^[a-z0-9-]{8,36}$/);
const urlArb = fc.stringMatching(/^https:\/\/storage\.example\.com\/invoices\/[a-z0-9-]{4,20}\.pdf$/);

const scenarioArb: fc.Arbitrary<Scenario> = fc.oneof(
  fc.constant<Scenario>({ type: 'staff_rejected' }),
  fc.constant<Scenario>({ type: 'service_timeout' }),
  urlArb.map<Scenario>((url) => ({ type: 'happy_path', invoiceUrl: url })),
  urlArb.map<Scenario>((url) => ({
    type: 'invoice_rejected_no_resubmit',
    invoiceUrl: url,
  })),
  fc.tuple(urlArb, urlArb).map<Scenario>(([url, resubUrl]) => ({
    type: 'invoice_rejected_resubmit_valid',
    invoiceUrl: url,
    resubmitUrl: resubUrl,
  })),
  fc.tuple(urlArb, urlArb).map<Scenario>(([url, resubUrl]) => ({
    type: 'invoice_rejected_resubmit_invalid',
    invoiceUrl: url,
    resubmitUrl: resubUrl,
  })),
);

// --- Property Test ---

describe('Medical Reimbursement Workflow — Idempotence Property Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWorkflowState();
  });

  /**
   * Property 6: Temporal workflow idempotence
   *
   * **Validates: Requirements 9.1, 14.4**
   *
   * For any workflow scenario, running the workflow twice with the same inputs
   * and the same signal sequence produces identical terminal status and
   * identical financial amounts (releaseReimbursement, awardXP).
   */
  it('re-running workflow with same inputs and signals produces same terminal status and financial amounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        idArb,
        idArb,
        idArb,
        idArb,
        scenarioArb,
        async (requestId, requesterId, catId, partnerId, scenario) => {
          // --- First run ---
          jest.clearAllMocks();
          resetWorkflowState();

          const run1 = await runWorkflowWithScenario(
            requestId,
            requesterId,
            catId,
            scenario,
            partnerId,
          );

          // --- Second run (same inputs, same scenario) ---
          jest.clearAllMocks();
          resetWorkflowState();

          const run2 = await runWorkflowWithScenario(
            requestId,
            requesterId,
            catId,
            scenario,
            partnerId,
          );

          // --- Assert idempotence ---

          // Same terminal status
          expect(run1.status).toBe(run2.status);

          // Same financial reimbursement calls (catId, amount, requestId)
          expect(run1.reimbursementCalls).toEqual(run2.reimbursementCalls);

          // Same XP award calls (requesterId, action, amount)
          expect(run1.xpCalls).toEqual(run2.xpCalls);

          // Additional: verify that reimbursed paths have exactly one reimbursement
          if (run1.status === 'reimbursed') {
            expect(run1.reimbursementCalls.length).toBe(1);
            expect(run1.reimbursementCalls[0]).toEqual([catId, requesterId, 5000, requestId]);
            expect(run1.xpCalls.length).toBe(1);
            expect(run1.xpCalls[0]).toEqual([requesterId, 'medical_reimbursed', 100]);
          }

          // Non-reimbursed paths should have zero financial calls
          if (run1.status !== 'reimbursed') {
            expect(run1.reimbursementCalls.length).toBe(0);
            expect(run1.xpCalls.length).toBe(0);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
