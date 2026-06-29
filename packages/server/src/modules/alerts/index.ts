/**
 * Alerts Module
 * Handles push notifications and alerts for users.
 * - New sighting of a followed cat
 * - Donation delivery confirmation
 * - Medical request status updates
 * - Ownership milestone (level-up) alerts
 *
 * Rate-limited to max 10 non-milestone notifications per user per hour.
 * Ownership milestone notifications bypass the rate limit.
 */

export interface AlertsModule {
  /** Send a notification to a user (rate-limited) */
  notify(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
  /** Send a milestone notification that bypasses rate limit */
  notifyMilestone(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
  /** Send a notification to multiple users (per-user rate-limited) */
  notifyMany(userIds: string[], title: string, body: string, options?: { data?: Record<string, string>; isMilestone?: boolean }): Promise<void>;
  /** Notify all Lvl1+ owners of a cat */
  notifyCatOwners(catId: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
}

export { AlertsService, ConsolePushProvider, NotifyOptions, PushProvider } from './alerts.service';
