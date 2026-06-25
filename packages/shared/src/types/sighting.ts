import { UUID } from './user';

/** Type of sighting report */
export type SightingType = 'visual' | 'feeding' | 'medical' | 'distress';

/** Represents a cat sighting report */
export interface Sighting {
  id: UUID;
  catId: UUID;
  reporterId: UUID;
  timestamp: Date;
  /** Fuzzed latitude for privacy */
  fuzzedLat: number;
  /** Fuzzed longitude for privacy */
  fuzzedLng: number;
  photoUrl: string;
  type: SightingType;
}
