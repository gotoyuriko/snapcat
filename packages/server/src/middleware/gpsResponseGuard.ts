import { Request, Response, NextFunction } from 'express';

/**
 * GPS Response Guard Middleware
 *
 * Intercepts all outgoing JSON responses to ensure no raw GPS coordinates
 * are ever serialised. This acts as a defence-in-depth layer on top of the
 * existing fuzzing logic at the data layer.
 *
 * The middleware:
 * 1. Strips any fields named `rawLat`, `rawLng`, `rawLatitude`, `rawLongitude`
 * 2. Strips bare `lat`/`lng`/`latitude`/`longitude` fields that appear
 *    outside of known safe patterns (e.g. query params in request bodies)
 *
 * Safe (allowed) field names that are NOT stripped:
 * - `fuzzedLat`, `fuzzedLng` — explicitly fuzzed
 * - `approxLat`, `approxLng` — the "lastKnownApprox" fields
 * - `lastKnownApproxLat`, `lastKnownApproxLng` — same as above at DB level
 *
 * Requirements: 5.5, 14.2
 */

/** Fields that indicate raw GPS data and must be stripped */
const RAW_GPS_FIELD_PATTERNS: RegExp[] = [
  /^rawLat$/i,
  /^rawLng$/i,
  /^rawLatitude$/i,
  /^rawLongitude$/i,
  /^raw_lat$/i,
  /^raw_lng$/i,
  /^raw_latitude$/i,
  /^raw_longitude$/i,
];

/** Fields with bare lat/lng names that should be stripped from responses */
const BARE_GPS_FIELD_PATTERNS: RegExp[] = [
  /^lat$/i,
  /^lng$/i,
  /^latitude$/i,
  /^longitude$/i,
];

/** Fields that are known to carry only fuzzed/approximate coordinates — safe to pass through */
const SAFE_FIELD_PATTERNS: RegExp[] = [
  /^fuzzedLat$/i,
  /^fuzzedLng$/i,
  /^approxLat$/i,
  /^approxLng$/i,
  /^lastKnownApproxLat$/i,
  /^lastKnownApproxLng$/i,
];

/**
 * Returns true if the field name matches a "safe" (allowed) GPS field pattern.
 */
function isSafeField(fieldName: string): boolean {
  return SAFE_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

/**
 * Returns true if the field name matches a raw GPS pattern that must be stripped.
 */
function isRawGpsField(fieldName: string): boolean {
  return RAW_GPS_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

/**
 * Returns true if the field name is a bare lat/lng name (not safe, not explicitly raw).
 */
function isBareGpsField(fieldName: string): boolean {
  return BARE_GPS_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

/**
 * Recursively walk a JSON-serialisable value and strip any raw GPS fields.
 * Returns the sanitised copy (does not mutate the original).
 */
export function stripRawGpsFields(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => stripRawGpsFields(item));
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Skip safe fields — they're fine
      if (isSafeField(key)) {
        result[key] = stripRawGpsFields(val);
        continue;
      }

      // Strip explicitly raw GPS fields
      if (isRawGpsField(key)) {
        continue; // omit from output
      }

      // Strip bare lat/lng fields (these should never appear in responses)
      if (isBareGpsField(key) && typeof val === 'number') {
        continue; // omit from output
      }

      // Recurse for nested objects/arrays
      result[key] = stripRawGpsFields(val);
    }
    return result;
  }

  // Primitives pass through unchanged
  return value;
}

/**
 * Express middleware that intercepts res.json() to strip raw GPS coordinates
 * from all API responses.
 *
 * Works by monkey-patching res.json on each request so the interceptor
 * is transparent to route handlers.
 */
export function gpsResponseGuard(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = function (body?: any): Response {
    if (body !== undefined && body !== null) {
      const sanitised = stripRawGpsFields(body);
      return originalJson(sanitised);
    }
    return originalJson(body);
  };

  next();
}
