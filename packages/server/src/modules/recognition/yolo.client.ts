import { config } from '../../config';
import sharp from 'sharp';

/**
 * Bounding box returned by the YOLO inference API.
 */
export interface YoloDetection {
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

/**
 * Result of detectCat: either a cropped Buffer of the detected cat region,
 * or an indication that no cat was found.
 */
export type DetectCatResult =
  | { cropped: Buffer }
  | { noDetection: true };

/**
 * Response from the local inference service's /detect endpoint
 * (packages/inference). Detection + cat-class filtering happen server-side.
 */
interface DetectResponse {
  detected: boolean;
  confidence?: number;
  box?: { x1: number; y1: number; x2: number; y2: number };
}

export class YoloClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(apiUrl?: string, apiKey?: string) {
    this.apiUrl = apiUrl ?? config.yolo.apiUrl;
    this.apiKey = apiKey ?? config.yolo.apiKey;
  }

  /**
   * Sends the photo buffer to the local YOLO inference endpoint,
   * detects cat(s) in the image, and crops the highest-confidence detection.
   *
   * @param photoBuffer - Raw image buffer (JPEG/PNG)
   * @returns `{ cropped: Buffer }` with the cropped cat region, or `{ noDetection: true }` if no cat found.
   */
  async detectCat(photoBuffer: Buffer): Promise<DetectCatResult> {
    if (config.recognitionMock) {
      // Mock mode: skip the external YOLO API and treat the whole image as the
      // detected cat region (no crop). Lets the pipeline run offline.
      return { cropped: photoBuffer };
    }

    const catDetections = await this.callYoloApi(photoBuffer);

    if (catDetections.length === 0) {
      return { noDetection: true };
    }

    // Pick the detection with the highest confidence
    const best = catDetections.reduce((a, b) =>
      a.confidence > b.confidence ? a : b
    );

    const cropped = await this.cropImage(photoBuffer, best.boundingBox);
    return { cropped };
  }

  /**
   * Calls the local inference service's /detect endpoint (YOLOX) and returns
   * the cat detection(s). The service does class filtering + confidence cutoff.
   */
  private async callYoloApi(imageBuffer: Buffer): Promise<YoloDetection[]> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(imageBuffer)]), 'image.jpg');

    let response: Response;
    try {
      response = await fetch(`${config.inference.url}/detect`, {
        method: 'POST',
        body: form,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Inference service unavailable: ${message}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Detect request failed with status ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as DetectResponse;
    if (!data.detected || !data.box) {
      return [];
    }

    return [
      {
        confidence: data.confidence ?? 0,
        boundingBox: {
          x: Math.round(data.box.x1),
          y: Math.round(data.box.y1),
          width: Math.round(data.box.x2 - data.box.x1),
          height: Math.round(data.box.y2 - data.box.y1),
        },
      },
    ];
  }

  /**
   * Crops the image buffer to the specified bounding box using sharp.
   */
  private async cropImage(
    imageBuffer: Buffer,
    bbox: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer> {
    // Get image metadata to clamp bounding box within image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth = metadata.width ?? 0;
    const imgHeight = metadata.height ?? 0;

    // Clamp bounding box to image boundaries
    const left = Math.max(0, bbox.x);
    const top = Math.max(0, bbox.y);
    const width = Math.min(bbox.width, imgWidth - left);
    const height = Math.min(bbox.height, imgHeight - top);

    if (width <= 0 || height <= 0) {
      throw new Error('Invalid bounding box: resulting crop area has zero or negative dimensions.');
    }

    const croppedBuffer = await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .toBuffer();

    return croppedBuffer;
  }

  /**
   * Lower-level method that returns raw detections (for testing/debugging).
   */
  async detectCats(imageBuffer: Buffer): Promise<YoloDetection[]> {
    return this.callYoloApi(imageBuffer);
  }
}
