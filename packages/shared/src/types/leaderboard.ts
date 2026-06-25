import { UUID } from './user';

/** A single entry in the leaderboard */
export interface LeaderboardEntry {
  userId: UUID;
  displayName: string;
  xp: number;
  rank: number;
  catsDiscovered: number;
}
