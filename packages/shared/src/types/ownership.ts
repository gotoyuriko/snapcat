import { UUID } from './user';

/**
 * Represents a user's ownership relationship with a cat (compound key: userId + catId).
 * Level is numeric: 0 = Discovered, 1+ = Owner.
 */
export interface Ownership {
  userId: UUID;
  catId: UUID;
  level: number;
  xp: number;
  since: Date;
}
