import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserEventDto } from './dto/batch-events.dto';

const ALLOWED_ACTIONS = new Set(['pageview', 'click', 'search', 'filter', 'feature_use']);
const MAX_BATCH = 100;
// Retention: events older than 90 days are irrelevant — cleaned up on demand
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
        target: e.target ? e.target.slice(0, 100) : null,
        // metadata: only allow plain key-value, strip anything that looks like
        // sensitive field names to enforce data minimisation
        metadata: e.metadata ? this.sanitiseMetadata(e.metadata) : null,
        duration: typeof e.duration === 'number' ? Math.min(e.duration, 86400) : null,
        // trust server time over client clock for integrity
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

    const [events, total] = await Promise.all([
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
    ]);

    // Build aggregations so the manager view is useful without rendering 200 raw rows
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

    return {
      total,
      totalSessions: sessionSet.size,
      totalDurationSec: totalDuration,
      topPages,
      actionFreq,
      recent: events.slice(0, 50),
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
