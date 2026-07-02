import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request } from 'express';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'cats');

/**
 * PhotoStorageService — stores scanned cat photos on local disk and serves
 * them back via GET /api/recognition/photos/:fileName. Cat photos are
 * treated as public (community sighting data), so URLs are unsigned —
 * unlike medical documents, which are private and signed.
 */
export class PhotoStorageService {
  private readonly uploadsDir: string;

  constructor() {
    this.uploadsDir = UPLOADS_DIR;
    this.ensureUploadsDir();
  }

  private ensureUploadsDir(): void {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  /** Store a photo buffer and return its stored file name. */
  async storePhoto(buffer: Buffer): Promise<string> {
    const fileName = `${crypto.randomUUID()}.jpg`;
    await fs.promises.writeFile(path.join(this.uploadsDir, fileName), buffer);
    return fileName;
  }

  /** Absolute path to a stored photo, or null if the file name is invalid/missing. */
  resolvePhotoPath(fileName: string): string | null {
    // path.basename strips any directory components, preventing path traversal.
    const safeName = path.basename(fileName);
    const filePath = path.join(this.uploadsDir, safeName);
    return fs.existsSync(filePath) ? filePath : null;
  }

  /**
   * Build a publicly-fetchable URL for a stored photo, using the incoming
   * request's own host — so it resolves correctly whether the API is
   * reached via localhost or a Cloudflare tunnel, without needing a static
   * env var that would go stale each time the tunnel URL changes.
   */
  buildUrl(req: Request, fileName: string): string {
    return `${req.protocol}://${req.get('host')}/api/recognition/photos/${encodeURIComponent(fileName)}`;
  }
}
