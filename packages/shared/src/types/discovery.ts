import { UUID } from './user';

/** Represents a user's discovery of a cat (compound key: userId + catId) */
export interface UserCatDiscovery {
  userId: UUID;
  catId: UUID;
  discoveredAt: Date;
}
