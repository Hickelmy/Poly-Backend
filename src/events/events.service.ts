import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserEventDto } from './dto/batch-events.dto';

const ALLOWED_ACTIONS = new Set(['pageview', 'click', 'search', 'filter', 'feature_use']);
const MAX_BATCH = 100;
const RETENTION_DAYS = 90;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async batchCreate(userId: string, events: UserEventDto[]) {
    const valid = events
      .slice(0, MAX_BATCH)
      .filter((e) => e.sessionId && e.page && ALLOWED_ACTIONS.has(e.action))
      .map((e) => ({
        userId,
        sessionId: e.sessionId.slice(0, 36),
        page: e.page.slice(0, 200),
        action: e.action,
        target: e.target ? e.target.slice(0, 100) : undefined,
        metadata: e.metadata ? this.sanitiseMetadata(e.metadata) : undefined,
        duration: typeof e.duration === 'number' ? Math.min(e.duration, 86400) : undefined,
        createdAt: new Date(),
      }));

    if (valid.length === 0) return { inserted: 0 };

    await this.prisma.userEvent.createMany({ data: valid, skipDuplicates: true });
    return { inserted: valid.length };
  }

  async getByUser(
    userId: string,
    opts: { limit?: number; page?: string; action?: string } = {},
  ) {
    const where: any = { userId };
    if (opts.page) where.page = { contains: opts.page };
    if (opts.action) where.action = opts.action;

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);

    const [events, total, heatmapRaw] = await Promise.all([
      this.prisma.userEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 200,
        select: {
          id: true,
          sessionId: true,
          page: true,
          action: true,
          target: true,
          metadata: true,
          duration: true,
          createdAt: true,
        },
      }),
      this.prisma.userEvent.count({ where }),
      // For heatmap: all events in last 90 days (only createdAt needed)
      this.prisma.userEvent.findMany({
        where: { userId, createdAt: { gte: ninetyDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // ── Aggregations from filtered events ──────────────────────────────────
    const pageFreq: Record<string, number> = {};
    const actionFreq: Record<string, number> = {};
    const sessionSet = new Set<string>();
    let totalDuration = 0;

    for (const e of events) {
      pageFreq[e.page] = (pageFreq[e.page] ?? 0) + 1;
      actionFreq[e.action] = (actionFreq[e.action] ?? 0) + 1;
      sessionSet.add(e.sessionId);
      if (e.duration) totalDuration += e.duration;
    }

    const topPages = Object.entries(pageFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([page, count]) => ({ page, count }));

    // ── Heatmap from last 90 days ──────────────────────────────────────────
    const daily: Record<string, number> = {};
    const hourly: number[] = new Array(24).fill(0);
    const weekday: number[] = new Array(7).fill(0); // 0=Sun … 6=Sat

    for (const e of heatmapRaw) {
      const date = e.createdAt.toISOString().split('T')[0];
      daily[date] = (daily[date] ?? 0) + 1;
      hourly[e.createdAt.getHours()]++;
      weekday[e.createdAt.getDay()]++;
    }

    return {
      total,
      totalSessions: sessionSet.size,
      totalDurationSec: totalDuration,
      topPages,
      actionFreq,
      recent: events.slice(0, 50),
      heatmap: { daily, hourly, weekday },
    };
  }

  async cleanup() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
    const { count } = await this.prisma.userEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { deleted: count };
  }

  private sanitiseMetadata(raw: Record<string, any>): Record<string, any> {
    const BLOCKED_KEYS = /password|token|secret|cpf|credit|card|cvv|pin|key/i;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (BLOCKED_KEYS.test(k)) continue;
      if (typeof v === 'string') out[k] = v.slice(0, 200);
      else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    }
    return out;
  }
}
