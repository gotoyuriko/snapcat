/** Actions that award XP in the gamification system (per design doc) */
export type GamificationAction =
  | 'discover_new'
  | 'scan'
  | 'donation'
  | 'medical_reimbursed';

/** Result of applying an XP-awarding action */
export interface XPResult {
  xpAwarded: number;
  newLevel: number;
  levelUp: boolean;
}
