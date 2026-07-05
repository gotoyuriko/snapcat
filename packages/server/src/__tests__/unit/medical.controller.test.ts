import { Request, Response } from 'express';
import { MedicalController } from '../../modules/medical/medical.controller';

// Mock MedicalService
jest.mock('../../modules/medical/medical.service', () => {
  const mockCreateRequest = jest.fn();
  const mockGetCertifiedPartners = jest.fn();
  const mockGetUserRequestsForCat = jest.fn();
  return {
    MedicalService: jest.fn().mockImplementation(() => ({
      createRequest: mockCreateRequest,
      getCertifiedPartners: mockGetCertifiedPartners,
      getUserRequestsForCat: mockGetUserRequestsForCat,
    })),
    MedicalRequestNotFoundError: class MedicalRequestNotFoundError extends Error {},
    __mockCreateRequest: mockCreateRequest,
    __mockGetCertifiedPartners: mockGetCertifiedPartners,
    __mockGetUserRequestsForCat: mockGetUserRequestsForCat,
  };
});

const {
  __mockCreateRequest: mockCreateRequest,
  __mockGetCertifiedPartners: mockGetCertifiedPartners,
  __mockGetUserRequestsForCat: mockGetUserRequestsForCat,
} = jest.requireMock('../../modules/medical/medical.service');

const VALID_REASON = 'The cat has a visibly injured left hind leg.';
const MOCK_FILES = [
  { buffer: Buffer.from('pdf-content'), originalname: 'vet-note.pdf' },
] as Express.Multer.File[];

function createMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: { userId: 'user-1', email: 'test@example.com' },
    body: {},
    files: undefined,
    ...overrides,
  };
}

function createMockRes(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = { statusCode: 0, body: null };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((data: any) => { res.body = data; return res; });
  return res;
}

describe('MedicalController', () => {
  let controller: MedicalController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCertifiedPartners.mockResolvedValue([]);
    controller = new MedicalController();
  });

  describe('create', () => {
    it('returns 400 if catId is missing', async () => {
      const req = createMockReq({ body: { type: 'medical', reason: VALID_REASON }, files: MOCK_FILES });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 if type is invalid', async () => {
      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'invalid', reason: VALID_REASON },
        files: MOCK_FILES,
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 if catId is not a valid UUID', async () => {
      const req = createMockReq({
        body: { catId: 'not-a-uuid', type: 'medical', reason: VALID_REASON },
        files: MOCK_FILES,
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 201 with created medical request on success', async () => {
      const mockResult = {
        id: 'req-1',
        catId: '550e8400-e29b-41d4-a716-446655440000',
        requesterId: 'user-1',
        type: 'medical',
        status: 'pending',
        partnerId: null,
        workflowId: '',
        documents: [],
        createdAt: new Date(),
      };
      mockCreateRequest.mockResolvedValue(mockResult);

      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'medical', reason: VALID_REASON },
        files: MOCK_FILES,
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ ...mockResult, certifiedPartners: [] });
      expect(mockCreateRequest).toHaveBeenCalledWith({
        catId: '550e8400-e29b-41d4-a716-446655440000',
        requesterId: 'user-1',
        type: 'medical',
        reason: VALID_REASON,
        documents: [{ buffer: Buffer.from('pdf-content'), originalName: 'vet-note.pdf' }],
      });
    });

    it('returns 400 when no supporting documents are attached (Requirement 9.4)', async () => {
      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'medical', reason: VALID_REASON },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(mockCreateRequest).not.toHaveBeenCalled();
    });

    it('returns 400 when reason is missing (Requirement 9.4)', async () => {
      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'medical' },
        files: MOCK_FILES,
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(mockCreateRequest).not.toHaveBeenCalled();
    });

    it('returns 201 with documents when files are uploaded (Requirement 9.9)', async () => {
      const mockResult = {
        id: 'req-2',
        catId: '550e8400-e29b-41d4-a716-446655440000',
        requesterId: 'user-1',
        type: 'grooming',
        status: 'pending',
        partnerId: null,
        workflowId: '',
        documents: ['http://localhost:3000/api/medical/documents/req-2/file1.pdf?expires=123&sig=abc'],
        createdAt: new Date(),
      };
      mockCreateRequest.mockResolvedValue(mockResult);

      const mockFiles = [
        { buffer: Buffer.from('pdf-content'), originalname: 'receipt.pdf' },
      ] as Express.Multer.File[];

      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'grooming', reason: VALID_REASON },
        files: mockFiles,
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(201);
      expect(mockCreateRequest).toHaveBeenCalledWith({
        catId: '550e8400-e29b-41d4-a716-446655440000',
        requesterId: 'user-1',
        type: 'grooming',
        reason: VALID_REASON,
        documents: [{ buffer: Buffer.from('pdf-content'), originalName: 'receipt.pdf' }],
      });
    });

    it('returns 500 if service throws an error', async () => {
      mockCreateRequest.mockRejectedValue(new Error('DB error'));

      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'medical', reason: VALID_REASON },
        files: MOCK_FILES,
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});

describe('GET /medical-requests/partners — listPartners (Req 9.13)', () => {
  it('returns the certified partner list', async () => {
    mockGetCertifiedPartners.mockResolvedValue([
      { id: 'p1', name: 'Happy Paws Vet', type: 'vet', contactEmail: 'hi@paws.my' },
    ]);
    const controller = new MedicalController();
    const req = createMockReq();
    const res = createMockRes();

    await controller.listPartners(req as Request, res as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body.certifiedPartners).toHaveLength(1);
    expect(res.body.certifiedPartners[0].name).toBe('Happy Paws Vet');
  });
});

describe('GET /medical-requests/cat/:catId/mine — myRequests', () => {
  it("returns the requester's own requests for the cat", async () => {
    mockGetUserRequestsForCat.mockResolvedValue([
      { id: 'r1', type: 'medical', reason: 'Injured leg', status: 'pending', createdAt: new Date(), partner: null },
    ]);
    const controller = new MedicalController();
    const req = createMockReq({ params: { catId: 'cat-1' } as any });
    const res = createMockRes();

    await controller.myRequests(req as Request, res as Response);

    expect(res.statusCode).toBe(200);
    expect(mockGetUserRequestsForCat).toHaveBeenCalledWith('user-1', 'cat-1');
    expect(res.body.requests).toHaveLength(1);
  });
});
