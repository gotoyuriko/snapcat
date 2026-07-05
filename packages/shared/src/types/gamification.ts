/** Actions that award XP in the gamification system (per design doc) */
export type GamificationAction =
  | 'discover_new'
  | 'scan'
  | 'donation'
  | 'medical_reimbursed';

/** A badge newly earned by an XP-awarding action (Requirement 18.2) */
export interface EarnedBadge {
  id: string;
  title: string;
  icon: string;
}

/** Result of applying an XP-awarding action */
export interface XPResult {
  xpAwarded: number;
  newLevel: number;
  levelUp: boolean;
  /**
   * Badges whose unlock threshold was crossed by this exact action —
   * the client shows a congratulatory animation for each (Req 18.2).
   */
  badgesEarned?: EarnedBadge[];
}
