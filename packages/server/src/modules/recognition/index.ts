import { OrchestrationResult } from '@codingkitty/shared';

/**
 * Recognition Module
 * Handles cat detection (YOLO) and re-identification (MegaDescriptor + pgvector).
 */

export interface RecognitionModule {
  /** Full recognition orchestration: detect → embed → match → record */
  recognizeCat(photo: Buffer, userGPS: { lat: number; lng: number }, userId: string): Promise<OrchestrationResult>;
  /** Confirm a borderline match or register as new cat */
  confirmMatch(userId: string, catId: string | 'new', embedding: number[], rawGPS: { lat: number; lng: number }, photoUrl: string): Promise<OrchestrationResult>;
}

export { RecognitionService, RawGPS } from './recognition.service';
export { RecognitionController } from './recognition.controller';
export { recognitionRoutes } from './recognition.routes';
