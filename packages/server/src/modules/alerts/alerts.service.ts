import { PrismaClient } from '@prisma/client';

/**
 * Options for sending a notification.
 * When `isMilestone` is true, the notification bypasses the rate limit.
 */
export interface NotifyOptions {
  /** Additional key-value data payload */
  data?: Record<string, string>;
  /** If true, bypasses the per-user rate limit (used for ownership level-up notifications) */
  isMilestone?: boolean;
}

/** Maximum non-milestone notifications per user per sliding hour window */
const RATE_LIMIT_MAX = 10;
/** Sliding window duration in milliseconds (1 hour) */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Push notification provider interface.
 * Implementations can wrap FCM, APNs, or a dev-mode logger.
 */
export interface PushProvider {
  send(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
}

/**
 * Default development push provider that logs notifications to console.
 * Used when no FCM/APNs provider is configured.
 */
export class ConsolePushProvider implements PushProvider {
  async send(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
    console.log(`[push-notification] To: ${userId} | Title: ${title} | Body: ${body}`, data ?? '');
  }
}

/**
 * AlertsService handles push notifications with a sliding-window rate limiter.
 *
 * - Rate limit: max 10 non-milestone notifications per user per hour
 * - Ownership milestone notifications (isMilestone=true) bypass the rate limit
 * - Uses the NotificationLog table in PostgreSQL for rate-limit state tracking
 * - Pluggable push provider (defaults to console logging in development)
 */
export class AlertsService {
  private prisma: PrismaClient;
  private pushProvider: PushProvider;

  constructor(prisma?: PrismaClient, pushProvider?: PushProvider) {
    this.prisma = prisma ?? new PrismaClient();
    this.pushProvider = pushProvider ?? new ConsolePushProvider();
  }

  /**
   * Send a push notification to a single user.
   * Preserves backward-compatible signature: notify(userId, title, body, data?)
   *
   * For milestone notifications that should bypass rate limiting,
   * use notifyMilestone() instead or pass options via the overloaded form.
   */
  async notify(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    await this.sendNotification(userId, title, body, { data, isMilestone: false });
  }

  /**
   * Send a milestone notification that bypasses the rate limit.
   * Used for ownership level-up events.
   */
  async notifyMilestone(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    await this.sendNotification(userId, title, body, { data, isMilestone: true });
  }

  /**
   * Send a push notification to multiple users.
   * Respects per-user rate limits individually.
   */
  async notifyMany(
    userIds: string[],
    title: string,
    body: string,
    options?: NotifyOptions,
  ): Promise<void> {
    const results = userIds.map((userId) =>
      this.sendNotification(userId, title, body, options ?? {}).catch(() => {
        // Individual notification failure shouldn't stop others
      }),
    );
    await Promise.all(results);
  }

  /**
   * Notify all Lvl1+ owners of a cat.
   * Replaces the old notifyCatFollowers placeholder.
   */
  async notifyCatOwners(
    catId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    // Revoked owners lose notifications (Requirement 16.2).
    const owners = await this.prisma.ownership.findMany({
      where: { catId, level: { gte: 1 }, revokedAt: null },
      select: { userId: true },
    });

    if (owners.length === 0) return;

    const userIds = owners.map((o) => o.userId);
    await this.notifyMany(userIds, title, body, { data });
  }

  /**
   * Core notification logic with rate limiting.
   */
  private async sendNotification(
    userId: string,
    title: string,
    body: string,
    options: NotifyOptions,
  ): Promise<void> {
    const isMilestone = options.isMilestone ?? false;

    // Rate limit check (milestone notifications bypass)
    if (!isMilestone) {
      const isAllowed = await this.checkRateLimit(userId);
      if (!isAllowed) {
        // Rate limited — silently drop the notification
        return;
      }
    }

    // Send via push provider
    await this.pushProvider.send(userId, title, body, options.data);

    // Log the notification for rate-limit tracking
    await this.prisma.notificationLog.create({
      data: {
        userId,
        title,
        body,
        isMilestone,
        sentAt: new Date(),
      },
    });
  }

  /**
   * Sliding window rate-limit check.
   * Counts non-milestone notifications sent to this user in the last hour.
   * Returns true if under the limit (allowed to send), false otherwise.
   */
  private async checkRateLimit(userId: string): Promise<boolean> {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

    const count = await this.prisma.notificationLog.count({
      where: {
        userId,
        isMilestone: false,
        sentAt: { gte: windowStart },
      },
    });

    return count < RATE_LIMIT_MAX;
  }
}
