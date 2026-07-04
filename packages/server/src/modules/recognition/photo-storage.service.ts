import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

  /** Delete a stored photo. Best-effort: a missing file is not an error. */
  async deletePhoto(fileName: string): Promise<void> {
    const filePath = this.resolvePhotoPath(fileName);
    if (!filePath) return;
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Cleanup is best-effort; an orphaned file must never fail the request.
    }
  }

  /** Absolute path to a stored photo, or null if the file name is invalid/missing. */
  resolvePhotoPath(fileName: string): string | null {
    // path.basename strips any directory components, preventing path traversal.
    const safeName = path.basename(fileName);
    const filePath = path.join(this.uploadsDir, safeName);
    return fs.existsSync(filePath) ? filePath : null;
  }

  /**
   * Host-less path for a stored photo, persisted as-is in the database.
   * Absolute URLs must not be stored: the tunnel hostname changes on every
   * `npm run tunnel` restart, which strands previously saved URLs. The
   * client prefixes its configured API host when rendering.
   */
  buildUrl(fileName: string): string {
    return `/api/recognition/photos/${encodeURIComponent(fileName)}`;
  }
}
