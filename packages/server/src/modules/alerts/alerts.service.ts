/**
 * TODO: Implement AlertsService
 * - Integrate with push notification service (FCM / APNs)
 * - Send notifications for sightings, donations, medical updates
 * - Manage user notification preferences
 */

export class AlertsService {
  async notify(_userId: string, _title: string, _body: string, _data?: Record<string, string>): Promise<void> {
    // TODO: Send push notification
    throw new Error('Not implemented');
  }

  async notifyCatFollowers(_catId: string, _title: string, _body: string): Promise<void> {
    // TODO: Query followers, send bulk notifications
    throw new Error('Not implemented');
  }
}
