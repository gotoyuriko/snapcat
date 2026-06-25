import { UUID } from './user';

/** Represents a cat registered in the system */
export interface Cat {
  id: UUID;
  name: string;
  /** Reference to the embedding vector stored in pgvector */
  embeddingRef: string;
  /** ID of the user who first discovered this cat */
  firstDiscovererId: UUID;
  /** Approximate last known latitude (fuzzed for privacy) */
  lastKnownApproxLat: number;
  /** Approximate last known longitude (fuzzed for privacy) */
  lastKnownApproxLng: number;
  photoUrl: string;
  registeredAt: Date;
}
