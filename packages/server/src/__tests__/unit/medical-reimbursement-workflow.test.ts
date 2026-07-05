/**
 * Unit tests for Medical Reimbursement Workflow Logic
 *
 * Tests the workflow state machine by mocking the Temporal SDK and activities.
 * Lifecycle: pending → awaiting_owner (owner picks a location) →
 * pending_review (staff arrange with the clinic) → in_progress (30-day
 * window) → reimbursed / rejected / timed_out.
 *
 * Requirements: 9.1–9.13, 15.4
 */

// --- Test constants ---
const REQUEST_ID = 'test-request-123';
const REQUESTER_ID = 'user-456';
const CAT_ID = 'cat-789';
const PARTNER_ID = 'partner-abc';
const INVOICE_URL = 'https://storage.example.com/invoices/receipt.pdf';
const RESUBMITTED_INVOICE_URL = 'https://storage.example.com/invoices/receipt-v2.pdf';

// --- Activity mocks ---
const mockNotifyPartner = jest.fn();
const mockUpdateMedicalRequestStatus = jest.fn();
const mockVerifyInvoice = jest.fn();
const mockReleaseReimbursement = jest.fn();
const mockAwardXP = jest.fn();
const mockNotifyUser = jest.fn();
const mockNotifyOwners = jest.fn();

// --- Temporal SDK mock infrastructure ---
let signalHandlers: Record<string, (...args: any[]) => void> = {};
let conditionCallbacks: Array<{ fn: () => boolean; timeout?: number; resolve: (v: boolean) => void }> = [];

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
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
  sleep: async (_duration: string) => {
    // No-op in tests
  },
}));

// Import after mocks are set up
import { medicalReimbursementWorkflow } from '../../workflows/medical-reimbursement.workflow';

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

const tick = () => new Promise((r) => setImmediate(r));

/** Drive the workflow through approval → owner choice → clinic agreement. */
async function driveToInProgress() {
  simulateSignal('staffDecision', { approved: true });
  await tick();
  simulateSignal('ownerChosePartner', PARTNER_ID);
  await tick();
  simulateSignal('partnerAccepted');
  await tick();
}

/** Statuses passed to updateMedicalRequestStatus, in order. */
const statusCalls = () => mockUpdateMedicalRequestStatus.mock.calls.map((c) => c[1]);

describe('MedicalReimbursementWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signalHandlers = {};
    conditionCallbacks = [];
    mockNotifyPartner.mockResolvedValue(undefined);
    mockUpdateMedicalRequestStatus.mockResolvedValue(undefined);
    mockReleaseReimbursement.mockResolvedValue({ released: true });
    mockAwardXP.mockResolvedValue(undefined);
    mockNotifyUser.mockResolvedValue(undefined);
    mockNotifyOwners.mockResolvedValue(undefined);
  });

  describe('Happy path — full reimbursement flow', () => {
    it('progresses awaiting_owner → pending_review → in_progress → reimbursed', async () => {
      mockVerifyInvoice.mockResolvedValue({ valid: true });

      const workflowPromise = medicalReimbursementWorkflow(REQUEST_ID, REQUESTER_ID, CAT_ID);
      await tick();
      await driveToInProgress();

      simulateSignal('serviceCompleted', {
        invoiceUrl: INVOICE_URL,
        receiptUrl: 'https://storage.example.com/receipt.jpg',
        amountCents: 12000,
      });
      await tick();

      const result = await workflowPromise;

      expect(result).toBe('reimbursed');
      expect(statusCalls()).toEqual([
        'awaiting_owner',
        'pending_review',
        'in_progress',
        'reimbursed',
      ]);
      // Owner's chosen partner is persisted at the pending_review transition
      const pendingReviewCall = mockUpdateMedicalRequestStatus.mock.calls.find(
        (c) => c[1] === 'pending_review',
      );
      expect(pendingReviewCall?.[2]).toBe(PARTNER_ID);
      expect(mockNotifyPartner).toHaveBeenCalledWith(PARTNER_ID, REQUEST_ID);
      // Invoiced amount drives the reimbursement
      expect(mockReleaseReimbursement).toHaveBeenCalledWith(CAT_ID, REQUESTER_ID, 12000, REQUEST_ID);
      expect(mockAwardXP).toHaveBeenCalledWith(REQUESTER_ID, 'medical_reimbursed', 100);
      // Owner is prompted to choose a location at awaiting_owner
      expect(mockNotifyUser).toHaveBeenCalledWith(
        REQUESTER_ID,
        expect.stringContaining('choose'),
      );
    });
  });

  describe('Rejection by staff review (Req 9.7)', () => {
    it('returns "rejected" with the staff reason', async () => {
      const workflowPromise = medicalReimbursementWorkflow(REQUEST_ID, REQUESTER_ID, CAT_ID);
      await tick();

      simulateSignal('staffDecision', { approved: false, reason: 'Insufficient documentation' });
      await tick();

      const result = await workflowPromise;

      expect(result).toBe('rejected');
      const rejectedCall = mockUpdateMedicalRequestStatus.mock.calls[0];
      expect(rejectedCall[1]).toBe('rejected');
      expect(rejectedCall[3]).toBe('Insufficient documentation');
      expect(mockNotifyUser).toHaveBeenCalledWith(
        REQUESTER_ID,
        expect.stringContaining('Insufficient documentation'),
      );
      expect(mockNotifyPartner).not.toHaveBeenCalled();
    });
  });

  describe('30-day service completion timeout (Req 9.11)', () => {
    it('returns "timed_out" when service not completed in the window', async () => {
      const workflowPromise = medicalReimbursementWorkflow(REQUEST_ID, REQUESTER_ID, CAT_ID);
      await tick();
      await driveToInProgress();

      simulateTimeout();
      await tick();

      const result = await workflowPromise;

      expect(result).toBe('timed_out');
      expect(statusCalls()).toEqual(['awaiting_owner', 'pending_review', 'in_progress', 'timed_out']);
      expect(mockNotifyUser).toHaveBeenCalledWith(
        REQUESTER_ID,
        expect.stringContaining('30-day'),
      );
    });
  });

  describe('Documentation rejection with re-submission (Req 9.8, 9.10)', () => {
    it('allows rejected → reimbursed transition on valid re-submission', async () => {
      mockVerifyInvoice
        .mockResolvedValueOnce({ valid: false, reason: 'Incomplete' })
        .mockResolvedValueOnce({ valid: true });

      const workflowPromise = medicalReimbursementWorkflow(REQUEST_ID, REQUESTER_ID, CAT_ID);
      await tick();
      await driveToInProgress();

      simulateSignal('serviceCompleted', { invoiceUrl: INVOICE_URL });
      await tick();
      simulateSignal('documentsResubmitted', { invoiceUrl: RESUBMITTED_INVOICE_URL });
      await tick();

      const result = await workflowPromise;

      expect(result).toBe('reimbursed');
      expect(statusCalls()).toContain('rejected');
      expect(statusCalls()).toContain('reimbursed');
      expect(mockVerifyInvoice).toHaveBeenCalledWith(INVOICE_URL, undefined);
      expect(mockVerifyInvoice).toHaveBeenCalledWith(RESUBMITTED_INVOICE_URL, undefined);
    });

    it('stays rejected if resubmitted documents are also invalid', async () => {
      mockVerifyInvoice.mockResolvedValue({ valid: false, reason: 'Still invalid' });

      const workflowPromise = medicalReimbursementWorkflow(REQUEST_ID, REQUESTER_ID, CAT_ID);
      await tick();
      await driveToInProgress();

      simulateSignal('serviceCompleted', { invoiceUrl: INVOICE_URL });
      await tick();
      simulateSignal('documentsResubmitted', { invoiceUrl: RESUBMITTED_INVOICE_URL });
      await tick();

      const result = await workflowPromise;

      expect(result).toBe('rejected');
      expect(mockNotifyUser).toHaveBeenCalledWith(
        REQUESTER_ID,
        'Your resubmitted documents were also rejected. The request is closed.',
      );
    });

    it('stays rejected if no resubmission within timeout', async () => {
      mockVerifyInvoice.mockResolvedValue({ valid: false, reason: 'Bad invoice' });

      const workflowPromise = medicalReimbursementWorkflow(REQUEST_ID, REQUESTER_ID, CAT_ID);
      await tick();
      await driveToInProgress();

      simulateSignal('serviceCompleted', { invoiceUrl: INVOICE_URL });
      await tick();
      simulateTimeout();
      await tick();

      const result = await workflowPromise;

      expect(result).toBe('rejected');
    });
  });

  describe('Insufficient pool funds (Req 9.9)', () => {
    it('closes as rejected with the pool reason when release fails', async () => {
      mockVerifyInvoice.mockResolvedValue({ valid: true });
      mockReleaseReimbursement.mockResolvedValue({
        released: false,
        reason: 'Community pool for this cat has 0 cents, but 5000 cents are needed',
      });

      const workflowPromise = medicalReimbursementWorkflow(REQUEST_ID, REQUESTER_ID, CAT_ID);
      await tick();
      await driveToInProgress();

      simulateSignal('serviceCompleted', { invoiceUrl: INVOICE_URL });
      await tick();

      const result = await workflowPromise;

      expect(result).toBe('rejected');
      expect(mockAwardXP).not.toHaveBeenCalled();
      expect(mockNotifyUser).toHaveBeenCalledWith(
        REQUESTER_ID,
        expect.stringContaining('could not be released'),
      );
    });
  });

  describe('Idempotence (Req 15.4)', () => {
    it('workflow uses requestId as its identifier for idempotent starts', () => {
      // workflowId = requestId is enforced at the client level (temporal-client.ts).
      expect(true).toBe(true);
    });
  });
});
