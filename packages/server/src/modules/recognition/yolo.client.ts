/**
 * TODO: Implement YOLO client
 * - Communicate with YOLOv8 inference service (HTTP or gRPC)
 * - Send image buffer, receive bounding boxes of detected cats
 * - Return detection confidence and bounding box coordinates
 */

export interface YoloDetection {
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export class YoloClient {
  async detectCats(_imageBuffer: Buffer): Promise<YoloDetection[]> {
    // TODO: Call YOLO inference service
    throw new Error('Not implemented');
  }
}
