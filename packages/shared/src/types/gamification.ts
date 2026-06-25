/** Actions that award XP in the gamification system */
export type GamificationAction =
  | 'first_discovery'
  | 'sighting_report'
  | 'donation'
  | 'medical_request'
  | 'chat_message'
  | 'daily_login'
  | 'streak_bonus';

/** Result of applying an XP-awarding action */
export interface XPResult {
  action: GamificationAction;
  xpAwarded: number;
  newTotalXp: number;
  levelUp: boolean;
  newLevel: number;
}
