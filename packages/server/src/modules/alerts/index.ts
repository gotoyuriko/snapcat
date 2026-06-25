/**
 * Alerts Module
 * Handles push notifications and alerts for users.
 * - New sighting of a followed cat
 * - Donation delivery confirmation
 * - Medical request status updates
 * - Nearby cat alert
 */

export interface AlertsModule {
  /** Send a notification to a user */
  notify(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
  /** Notify all followers of a cat about a new event */
  notifyCatFollowers(catId: string, title: string, body: string): Promise<void>;
}

export { AlertsService } from './alerts.service';
