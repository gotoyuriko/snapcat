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
 * Raw prediction item from the Ultralytics YOLO inference API response.
 */
interface UltralyticsPrediction {
  class: number;
  name: string;
  confidence: number;
  box: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

/**
 * COCO class ID for "cat".
 */
const CAT_CLASS_ID = 15;
const CAT_CLASS_NAME = 'cat';

/**
 * Minimum confidence threshold for accepting a detection.
 */
const MIN_CONFIDENCE = 0.25;

export class YoloClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(apiUrl?: string, apiKey?: string) {
    this.apiUrl = apiUrl ?? config.yolo.apiUrl;
    this.apiKey = apiKey ?? config.yolo.apiKey;
  }

  /**
   * Sends the photo buffer to the Ultralytics YOLO inference endpoint,
   * detects cat(s) in the image, and crops the highest-confidence detection.
   *
   * @param photoBuffer - Raw image buffer (JPEG/PNG)
   * @returns `{ cropped: Buffer }` with the cropped cat region, or `{ noDetection: true }` if no cat found.
   */
  async detectCat(photoBuffer: Buffer): Promise<DetectCatResult> {
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
   * Calls the Ultralytics YOLO API and returns all cat detections.
   * Uses base64 encoding to avoid FormData type issues in the monorepo.
   */
  private async callYoloApi(imageBuffer: Buffer): Promise<YoloDetection[]> {
    if (!this.apiKey) {
      throw new Error('YOLO API key is not configured. Set YOLO_API_KEY in your environment.');
    }

    const base64Image = imageBuffer.toString('base64');

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'yolov8n',
        image: base64Image,
        confidence: MIN_CONFIDENCE,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `YOLO API request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = (await response.json()) as
      | { data?: UltralyticsPrediction[] }
      | UltralyticsPrediction[];

    // The Ultralytics API may return { data: [...] } or directly [...]
    const predictions: UltralyticsPrediction[] = Array.isArray(data)
      ? data
      : (data.data ?? []);

    // Filter to cat detections only (class ID 15 or name "cat")
    const catPredictions = predictions.filter(
      (p) => p.class === CAT_CLASS_ID || p.name === CAT_CLASS_NAME
    );

    return catPredictions.map((p) => ({
      confidence: p.confidence,
      boundingBox: {
        x: Math.round(p.box.x1),
        y: Math.round(p.box.y1),
        width: Math.round(p.box.x2 - p.box.x1),
        height: Math.round(p.box.y2 - p.box.y1),
      },
    }));
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
