import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'medical');

/**
 * DocumentStorageService
 * Handles document uploads to object storage.
 * In dev mode, uses local filesystem with signed URL simulation.
 * In production, this would be replaced with S3/GCS integration.
 */
export class DocumentStorageService {
  private readonly uploadsDir: string;
  private readonly signingSecret: string;

  constructor() {
    this.uploadsDir = UPLOADS_DIR;
    this.signingSecret = process.env.DOCUMENT_SIGNING_SECRET || 'dev-signing-secret';
    this.ensureUploadsDir();
  }

  private ensureUploadsDir(): void {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  /**
   * Store a document buffer and return a signed URL for later access.
   * @param buffer - File content buffer
   * @param originalName - Original file name
   * @param requestId - Associated medical request ID
   * @returns Signed URL string for accessing the document
   */
  async storeDocument(
    buffer: Buffer,
    originalName: string,
    requestId: string,
  ): Promise<string> {
    const ext = path.extname(originalName) || '.bin';
    const fileId = crypto.randomUUID();
    const fileName = `${requestId}/${fileId}${ext}`;
    const filePath = path.join(this.uploadsDir, fileName);

    // Ensure subdirectory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(filePath, buffer);

    return this.generateSignedUrl(fileName);
  }

  /**
   * Generate a time-limited signed URL for a stored document.
   * In dev, this creates a token with an expiry timestamp that can be verified.
   * @param fileName - Relative path within the uploads directory
   * @param expiresInSeconds - URL validity duration (default: 1 hour)
   */
  generateSignedUrl(fileName: string, expiresInSeconds = 3600): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${fileName}:${expires}`;
    const signature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex');

    // In dev, return a local URL with signed token
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/api/medical-requests/documents/${encodeURIComponent(fileName)}?expires=${expires}&sig=${signature}`;
  }

  /**
   * Absolute path to a stored document, or null if the name escapes the
   * uploads directory or the file doesn't exist. `fileName` may contain a
   * requestId subdirectory (e.g. "req-id/uuid.pdf").
   */
  resolveDocumentPath(fileName: string): string | null {
    const filePath = path.resolve(this.uploadsDir, fileName);
    if (!filePath.startsWith(this.uploadsDir + path.sep)) {
      return null; // path traversal attempt
    }
    return fs.existsSync(filePath) ? filePath : null;
  }

  /**
   * Verify a signed URL token.
   * @returns true if the signature is valid and not expired
   */
  verifySignedUrl(fileName: string, expires: number, signature: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    if (now > expires) {
      return false; // Expired
    }

    const payload = `${fileName}:${expires}`;
    const expected = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return false; // malformed signature (wrong length / non-hex)
    }
  }
}
