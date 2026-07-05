import { PrismaClient } from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';

/**
 * Requirement 16 — Inactivity & Ownership Revocation.
 *
 * An Owner (Lvl1+) who has not donated to or scanned a cat for 8 consecutive
 * months loses owner privileges for that cat (revokedAt set). The historical
 * level and XP are retained so a later re-scan restores the level (Req 16.4,
 * handled in GamificationService). A warning push is sent 30 days before the
 * threshold (Req 16.5). Revocations are processed by a daily batch (Req 16.6).
 */

/** Months of inactivity after which ownership is revoked (Req 16.1). */
export const INACTIVITY_MONTHS = 8;
/** Days before the threshold at which the warning is sent (Req 16.5). */
export const WARNING_DAYS = 30;

/** `date` minus `months` calendar months. */
function subtractMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

/** `date` plus `days` days. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export interface InactivitySweepResult {
  warned: number;
  revoked: number;
}

export class InactivityService {
  private prisma: PrismaClient;
  private alertsService: AlertsService;

  constructor(prisma?: PrismaClient, alertsService?: AlertsService) {
    this.prisma = prisma ?? new PrismaClient();
    this.alertsService = alertsService ?? new AlertsService();
  }

  /**
   * One batch sweep (Req 16.6): revoke owners past the 8-month threshold,
   * then warn not-yet-warned owners within 30 days of it.
   * `now` is injectable for tests.
   */
  async processInactivity(now: Date = new Date()): Promise<InactivitySweepResult> {
    const revokeCutoff = subtractMonths(now, INACTIVITY_MONTHS);
    const warnCutoff = addDays(revokeCutoff, WARNING_DAYS);

    // --- Revoke (Req 16.1–16.3): lastActiveAt at or before the cutoff. ---
    const toRevoke = await this.prisma.ownership.findMany({
      where: { level: { gte: 1 }, revokedAt: null, lastActiveAt: { lte: revokeCutoff } },
      select: { userId: true, catId: true, cat: { select: { name: true } } },
    });

    for (const ownership of toRevoke) {
      // Level and XP are retained (Req 16.2); status reverts to Discovered
      // via the privilege gates — the UserCatDiscovery record is untouched
      // (Req 16.3).
      await this.prisma.ownership.update({
        where: { userId_catId: { userId: ownership.userId, catId: ownership.catId } },
        data: { revokedAt: now },
      });
      await this.notifySafely(
        ownership.userId,
        'Ownership Revoked',
        `Your ownership of ${ownership.cat?.name ?? 'a cat'} was revoked after ` +
          `${INACTIVITY_MONTHS} months of inactivity. Scan the cat again to restore your level.`,
      );
    }

    // --- Warn (Req 16.5): within 30 days of the threshold, not yet warned. ---
    const toWarn = await this.prisma.ownership.findMany({
      where: {
        level: { gte: 1 },
        revokedAt: null,
        inactivityWarnedAt: null,
        lastActiveAt: { lte: warnCutoff, gt: revokeCutoff },
      },
      select: { userId: true, catId: true, cat: { select: { name: true } } },
    });

    for (const ownership of toWarn) {
      await this.prisma.ownership.update({
        where: { userId_catId: { userId: ownership.userId, catId: ownership.catId } },
        data: { inactivityWarnedAt: now },
      });
      await this.notifySafely(
        ownership.userId,
        'Ownership At Risk',
        `You will lose ownership of ${ownership.cat?.name ?? 'a cat'} in ${WARNING_DAYS} days ` +
          `unless you donate or scan. Visit them soon!`,
      );
    }

    return { warned: toWarn.length, revoked: toRevoke.length };
  }

  /** Ownership status pushes bypass the rate limit (Req 12.5 milestone rule). */
  private async notifySafely(userId: string, title: string, body: string): Promise<void> {
    try {
      await this.alertsService.notifyMilestone(userId, title, body);
    } catch {
      // A push failure must never abort the batch sweep.
    }
  }
}

/**
 * Start the daily inactivity job (Req 16.6). Runs one sweep immediately,
 * then every `intervalMs` (default 24 h). The timer is unref'd so it never
 * keeps the process alive. Returns a stop function.
 */
export function startInactivityJob(
  service: InactivityService = new InactivityService(),
  intervalMs: number = 24 * 60 * 60 * 1000,
): () => void {
  const sweep = () =>
    service.processInactivity().catch((err) => {
      console.error('[inactivity-job] sweep failed:', err);
    });

  void sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
