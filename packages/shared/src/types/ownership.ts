import { UUID } from './user';

/** Ownership level enum representing the user's relationship with a cat */
export type OwnershipLevel = 'discoverer' | 'caretaker' | 'guardian';

/** Represents a user's ownership relationship with a cat (compound key: userId + catId) */
export interface Ownership {
  userId: UUID;
  catId: UUID;
  level: OwnershipLevel;
  xp: number;
  since: Date;
}
