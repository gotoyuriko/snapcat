import { Request, Response } from 'express';
import { MedicalController } from '../../modules/medical/medical.controller';

// Mock MedicalService
jest.mock('../../modules/medical/medical.service', () => {
  const mockCreateRequest = jest.fn();
  return {
    MedicalService: jest.fn().mockImplementation(() => ({
      createRequest: mockCreateRequest,
    })),
    __mockCreateRequest: mockCreateRequest,
  };
});

const { __mockCreateRequest: mockCreateRequest } = jest.requireMock('../../modules/medical/medical.service');

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
    controller = new MedicalController();
  });

  describe('create', () => {
    it('returns 400 if catId is missing', async () => {
      const req = createMockReq({ body: { type: 'medical' } });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 if type is invalid', async () => {
      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'invalid' },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 if catId is not a valid UUID', async () => {
      const req = createMockReq({
        body: { catId: 'not-a-uuid', type: 'medical' },
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
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'medical' },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(mockResult);
      expect(mockCreateRequest).toHaveBeenCalledWith({
        catId: '550e8400-e29b-41d4-a716-446655440000',
        requesterId: 'user-1',
        type: 'medical',
        documents: undefined,
      });
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
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'grooming' },
        files: mockFiles,
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(201);
      expect(mockCreateRequest).toHaveBeenCalledWith({
        catId: '550e8400-e29b-41d4-a716-446655440000',
        requesterId: 'user-1',
        type: 'grooming',
        documents: [{ buffer: Buffer.from('pdf-content'), originalName: 'receipt.pdf' }],
      });
    });

    it('returns 500 if service throws an error', async () => {
      mockCreateRequest.mockRejectedValue(new Error('DB error'));

      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', type: 'medical' },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});
