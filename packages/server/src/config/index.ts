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
