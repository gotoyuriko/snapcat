/**
 * Requirement 8.5 — general image sharing in community chat:
 * photo upload endpoint (Lvl1+ gate, image-type check) and photo-only
 * messages (empty text allowed when a photo is attached).
 */
import { Request, Response } from 'express';

const mockIsLvl1Owner = jest.fn();
const mockSendMessage = jest.fn();
const mockGetMessages = jest.fn();

jest.mock('../chat.service', () => ({
  ChatService: jest.fn().mockImplementation(() => ({
    isLvl1Owner: mockIsLvl1Owner,
    sendMessage: mockSendMessage,
    getMessages: mockGetMessages,
  })),
  ForbiddenError: class ForbiddenError extends Error {},
}));

const mockStorePhoto = jest.fn();
jest.mock('../../recognition/photo-storage.service', () => ({
  PhotoStorageService: jest.fn().mockImplementation(() => ({
    storePhoto: mockStorePhoto,
  })),
}));

jest.mock('../chat.gateway', () => ({
  broadcastChatMessage: jest.fn(),
}));

import { ChatController } from '../chat.controller';

function createMockReq(overrides: Record<string, any> = {}): Partial<Request> {
  return {
    user: { userId: 'owner-1', email: 'test@example.com' },
    params: { catId: 'cat-1' },
    body: {},
    ...overrides,
  };
}

function createMockRes(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = { statusCode: 0, body: null };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((data: any) => { res.body = data; return res; });
  return res;
}

const JPEG_FILE = {
  buffer: Buffer.from('fake-image'),
  mimetype: 'image/jpeg',
  originalname: 'photo.jpg',
};

describe('POST /cats/:catId/photos — uploadPhoto (Req 8.5)', () => {
  let controller: ChatController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ChatController();
    mockIsLvl1Owner.mockResolvedValue(true);
    mockStorePhoto.mockResolvedValue('stored-file.jpg');
  });

  it('stores the photo and returns a URL under the allowlisted photo route', async () => {
    const req = createMockReq({ file: JPEG_FILE });
    const res = createMockRes();

    await controller.uploadPhoto(req as Request, res as Response);

    expect(res.statusCode).toBe(201);
    expect(res.body.photoUrl).toBe('/api/recognition/photos/stored-file.jpg');
    // The returned URL must pass the sendMessage photoUrl allowlist
    expect(res.body.photoUrl).toMatch(/^\/api\/recognition\/photos\//);
  });

  it('rejects non-owners with 403 without storing anything (Req 8.2)', async () => {
    mockIsLvl1Owner.mockResolvedValue(false);
    const req = createMockReq({ file: JPEG_FILE });
    const res = createMockRes();

    await controller.uploadPhoto(req as Request, res as Response);

    expect(res.statusCode).toBe(403);
    expect(mockStorePhoto).not.toHaveBeenCalled();
  });

  it('rejects a missing file with 400', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await controller.uploadPhoto(req as Request, res as Response);

    expect(res.statusCode).toBe(400);
  });

  it('rejects non-image uploads with 400', async () => {
    const req = createMockReq({
      file: { ...JPEG_FILE, mimetype: 'application/pdf' },
    });
    const res = createMockRes();

    await controller.uploadPhoto(req as Request, res as Response);

    expect(res.statusCode).toBe(400);
    expect(mockStorePhoto).not.toHaveBeenCalled();
  });
});

describe('POST /cats/:catId/messages — photo-only messages (Req 8.5)', () => {
  let controller: ChatController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ChatController();
    mockSendMessage.mockResolvedValue({
      id: 'm1',
      catId: 'cat-1',
      senderId: 'owner-1',
      content: '',
      photoUrl: '/api/recognition/photos/x.jpg',
      createdAt: new Date(),
    });
  });

  it('accepts a message with a photo and no text', async () => {
    const req = createMockReq({
      body: { photoUrl: '/api/recognition/photos/x.jpg' },
    });
    const res = createMockRes();

    await controller.sendMessage(req as Request, res as Response);

    expect(res.statusCode).toBe(201);
    expect(mockSendMessage).toHaveBeenCalledWith(
      'cat-1',
      'owner-1',
      '',
      '/api/recognition/photos/x.jpg',
    );
  });

  it('still rejects a message with neither text nor photo', async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await controller.sendMessage(req as Request, res as Response);

    expect(res.statusCode).toBe(400);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('still rejects external photo URLs', async () => {
    const req = createMockReq({
      body: { photoUrl: 'https://evil.example.com/x.jpg' },
    });
    const res = createMockRes();

    await controller.sendMessage(req as Request, res as Response);

    expect(res.statusCode).toBe(400);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
