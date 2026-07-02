import dotenv from 'dotenv';

dotenv.config();

/** Application configuration loaded from environment variables */
export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  /** Access token expiry: exactly 15 minutes, no tolerance */
  jwtAccessExpiresInSeconds: 15 * 60,
  /** Refresh token expiry: 7 days */
  jwtRefreshExpiresInSeconds: 7 * 24 * 60 * 60,
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  gpsFuzzRadiusMeters: parseInt(process.env.GPS_FUZZ_RADIUS_METERS || '200', 10),
  /**
   * When true, the recognition pipeline stubs YOLO detection + MegaDescriptor
   * embedding instead of calling external AI services — lets the full
   * scan→match/new-cat→XP flow run offline for local dev. Set RECOGNITION_MOCK=true.
   */
  recognitionMock: process.env.RECOGNITION_MOCK === 'true',
  /** Self-hosted inference service (YOLO detection + MegaDescriptor embedding). */
  inference: {
    url: process.env.INFERENCE_URL || 'http://localhost:8000',
  },
  recognition: {
    /**
     * Cosine-similarity thresholds for cat re-identification. Two photos of
     * the same real cat rarely score near 1.0 (different crop/pose/lighting
     * per scan), so confirmThreshold is kept generous — genuine rescans
     * should at least reach "confirm_needed" rather than silently
     * registering as a duplicate new cat. Tune via env once real usage data
     * is available.
     */
    matchThreshold: parseFloat(process.env.RECOGNITION_MATCH_THRESHOLD || '0.85'),
    confirmThreshold: parseFloat(process.env.RECOGNITION_CONFIRM_THRESHOLD || '0.5'),
  },
  yolo: {
    apiUrl: process.env.YOLO_API_URL || 'https://api.ultralytics.com/v1/predict',
    apiKey: process.env.YOLO_API_KEY || '',
  },
  megadescriptor: {
    apiUrl: process.env.MEGADESCRIPTOR_API_URL || 'https://api-inference.huggingface.co/models/wildlife-tools/megadescriptor',
    apiKey: process.env.MEGADESCRIPTOR_API_KEY || '',
  },
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'sandbox-webhook-secret',
} as const;
