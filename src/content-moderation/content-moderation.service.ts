import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ModerationStatus = 'active' | 'restricted' | 'removed' | 'highlighted' | 'approved';

export interface ModerationAction {
  status?: ModerationStatus;
  managerNotice?: string | null;
  noticeVisible?: boolean;
  wasEdited?: boolean;
  editNote?: string | null;
  expiresAt?: Date | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  approvedByEmail?: string | null;
  approvalNote?: string | null;
}

@Injectable()
export class ContentModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async get(entityType: string, entityId: string) {
    return this.prisma.contentModeration.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    });
  }

  async upsert(
    entityType: string,
    entityId: string,
    action: ModerationAction,
    actorId: string,
    actorEmail: string,
  ) {
    const data = {
      ...action,
      actorId,
      actorEmail,
    };

    const result = await this.prisma.contentModeration.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      create: { entityType, entityId, ...data },
      update: data,
    });

    // Resolve the content owner for audit log targetId
    const owner = await this.resolveContentOwner(entityType, entityId);

    // Write to audit log
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorEmail,
        targetId: owner?.id ?? null,
        targetEmail: owner?.email ?? null,
        action: `content_${action.status ?? 'moderated'}`,
        entity: entityType,
        entityId,
        details: { ...action, contentTitle: owner?.title },
      },
    });

    return result;
  }

  private async resolveContentOwner(entityType: string, entityId: string): Promise<{ id?: string; email?: string; title?: string } | null> {
    try {
      if (entityType === 'product') {
        const p = await this.prisma.product.findUnique({ where: { id: entityId }, select: { sellerId: true, sellerEmail: true, title: true } });
        return p ? { id: p.sellerId ?? undefined, email: p.sellerEmail ?? undefined, title: p.title } : null;
      }
      if (entityType === 'service') {
        const s = await this.prisma.service.findUnique({ where: { id: entityId }, select: { providerId: true, providerEmail: true, title: true } });
        return s ? { id: s.providerId ?? undefined, email: s.providerEmail ?? undefined, title: s.title } : null;
      }
      if (entityType === 'project') {
        const p = await this.prisma.project.findUnique({ where: { id: entityId }, select: { ownerId: true, ownerEmail: true, title: true } });
        return p ? { id: p.ownerId ?? undefined, email: p.ownerEmail ?? undefined, title: p.title } : null;
      }
      if (entityType === 'comment') {
        const c = await this.prisma.newsComment.findUnique({ where: { id: entityId }, select: { userId: true, content: true } });
        if (c) {
          const u = await this.prisma.user.findUnique({ where: { id: c.userId }, select: { email: true } });
          return { id: c.userId, email: u?.email ?? undefined, title: c.content?.slice(0, 60) };
        }
        return null;
      }
      if (entityType === 'news') {
        const n = await this.prisma.news.findUnique({ where: { id: entityId }, select: { authorId: true, title: true } });
        if (n) {
          const u = await this.prisma.user.findUnique({ where: { id: n.authorId }, select: { email: true } });
          return { id: n.authorId, email: u?.email ?? undefined, title: n.title };
        }
        return null;
      }
    } catch { /* ignore lookup failures */ }
    return null;
  }

  async approve(
    entityType: string,
    entityId: string,
    actorId: string,
    actorEmail: string,
    approvalNote?: string,
  ) {
    return this.upsert(
      entityType,
      entityId,
      {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: actorId,
        approvedByEmail: actorEmail,
        approvalNote: approvalNote ?? null,
      },
      actorId,
      actorEmail,
    );
  }

  async revokeApproval(entityType: string, entityId: string, actorId: string, actorEmail: string) {
    return this.upsert(
      entityType,
      entityId,
      {
        status: 'active',
        approvedAt: null,
        approvedBy: null,
        approvedByEmail: null,
        approvalNote: null,
      },
      actorId,
      actorEmail,
    );
  }

  async getByUser(userId: string) {
    // Gather entity IDs owned by this user across entity types
    const [products, services, projects, comments] = await Promise.all([
      this.prisma.product.findMany({ where: { sellerId: userId }, select: { id: true, title: true } }),
      this.prisma.service.findMany({ where: { providerId: userId }, select: { id: true, title: true } }),
      this.prisma.project.findMany({ where: { ownerId: userId }, select: { id: true, title: true } }),
      this.prisma.newsComment.findMany({ where: { userId }, select: { id: true, content: true } }),
    ]);

    const entityIds = [
      ...products.map((p) => ({ type: 'product', id: p.id, label: p.title })),
      ...services.map((s) => ({ type: 'service', id: s.id, label: s.title })),
      ...projects.map((p) => ({ type: 'project', id: p.id, label: p.title })),
      ...comments.map((c) => ({ type: 'comment', id: c.id, label: c.content?.slice(0, 80) })),
    ];

    if (entityIds.length === 0) return { items: [] };

    // Fetch all existing moderation records
    const moderations = await this.prisma.contentModeration.findMany({
      where: {
        OR: entityIds.map((e) => ({ entityType: e.type, entityId: e.id })),
      },
    });

    const modMap = new Map(moderations.map((m) => [`${m.entityType}:${m.entityId}`, m]));

    const items = entityIds.map((e) => ({
      entityType: e.type,
      entityId: e.id,
      label: e.label,
      moderation: modMap.get(`${e.type}:${e.id}`) ?? null,
    }));

    return { items };
  }

  /** Bulk fetch moderation states for a list of entity ids. */
  async getBulk(entities: { type: string; id: string }[]) {
    if (entities.length === 0) return [];
    const records = await this.prisma.contentModeration.findMany({
      where: { OR: entities.map((e) => ({ entityType: e.type, entityId: e.id })) },
    });
    return records;
  }
}
