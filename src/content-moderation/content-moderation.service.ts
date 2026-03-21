import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ModerationStatus = 'active' | 'restricted' | 'removed' | 'highlighted' | 'approved';

export interface ModerationAction {
  status?: ModerationStatus;
  managerNotice?: string | null;
  wasEdited?: boolean;
  editNote?: string | null;
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

    // Write to audit log
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorEmail,
        action: `content_${action.status ?? 'moderated'}`,
        entity: entityType,
        entityId,
        details: { ...action },
      },
    });

    return result;
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
