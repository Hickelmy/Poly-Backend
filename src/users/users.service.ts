import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('E-mail já está em uso');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Os dados sensíveis já vêm criptografados do frontend
    // Apenas salvamos no banco (a descriptografia acontece no findOne)
    const userData: any = {
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: 'USER',
    };

    // Adiciona campos de endereço se fornecidos (já criptografados)
    if (dto.phone) userData.phone = dto.phone;
    if (dto.cep) userData.cep = dto.cep;
    if (dto.state) userData.state = dto.state;
    if (dto.city) userData.city = dto.city;
    if (dto.neighborhood) userData.neighborhood = dto.neighborhood;
    if (dto.street) userData.street = dto.street;
    if (dto.houseNumber) userData.houseNumber = dto.houseNumber;

    return this.prisma.user.create({
      data: userData,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        bannerUrl: true,
        pixKeyRandom: true,
        pixKeyPhone: true,
        pixKeyEmail: true,
        pixKeyCpf: true,
        phone: true,
        cep: true,
        state: true,
        city: true,
        neighborhood: true,
        street: true,
        houseNumber: true,
        residenceLat: true,
        residenceLng: true,
        residenceZoneId: true,
        currentZoneId: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Descriptografa campos sensíveis
    const sensitiveFields = [
      'phone',
      'cep',
      'street',
      'houseNumber',
      'neighborhood',
      'pixKeyRandom',
      'pixKeyPhone',
      'pixKeyEmail',
      'pixKeyCpf',
    ];

    const decryptedUser = await this.encryptionService.decryptObject(
      user,
      sensitiveFields,
      user.email,
    );

    // Map to frontend format
    return {
      ...decryptedUser,
      residence_lat: decryptedUser.residenceLat,
      residence_lng: decryptedUser.residenceLng,
      residence_zone_id: decryptedUser.residenceZoneId,
      current_zone_id: decryptedUser.currentZoneId,
    };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.ensureExists(id);

    // Busca o email do usuário para descriptografar se necessário
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true },
    });

    // Os dados já vêm criptografados do frontend, então apenas salvamos
    // A descriptografia acontece no findOne quando os dados são lidos
    // Só inclui campos que foram enviados (evita sobrescrever com undefined)
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    // role is excluded — use updateRole() to change roles
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.bannerUrl !== undefined) data.bannerUrl = dto.bannerUrl;
    if (dto.pixKeyRandom !== undefined) data.pixKeyRandom = dto.pixKeyRandom;
    if (dto.pixKeyPhone !== undefined) data.pixKeyPhone = dto.pixKeyPhone;
    if (dto.pixKeyEmail !== undefined) data.pixKeyEmail = dto.pixKeyEmail;
    if (dto.pixKeyCpf !== undefined) data.pixKeyCpf = dto.pixKeyCpf;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.cep !== undefined) data.cep = dto.cep;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.neighborhood !== undefined) data.neighborhood = dto.neighborhood;
    if (dto.street !== undefined) data.street = dto.street;
    if (dto.houseNumber !== undefined) data.houseNumber = dto.houseNumber;

    // Handle residence fields (snake_case from frontend)
    if ((dto as any).residence_lat !== undefined) {
      data.residenceLat = (dto as any).residence_lat;
    }
    if ((dto as any).residence_lng !== undefined) {
      data.residenceLng = (dto as any).residence_lng;
    }
    if ((dto as any).residence_zone_id !== undefined) {
      data.residenceZoneId = (dto as any).residence_zone_id;
    }
    if ((dto as any).current_zone_id !== undefined) {
      data.currentZoneId = (dto as any).current_zone_id;
    }

    // Also handle camelCase versions
    if ((dto as any).residenceLat !== undefined) {
      data.residenceLat = (dto as any).residenceLat;
    }
    if ((dto as any).residenceLng !== undefined) {
      data.residenceLng = (dto as any).residenceLng;
    }
    if ((dto as any).residenceZoneId !== undefined) {
      data.residenceZoneId = (dto as any).residenceZoneId;
    }
    if ((dto as any).currentZoneId !== undefined) {
      data.currentZoneId = (dto as any).currentZoneId;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        bannerUrl: true,
        pixKeyRandom: true,
        pixKeyPhone: true,
        pixKeyEmail: true,
        pixKeyCpf: true,
        phone: true,
        cep: true,
        state: true,
        city: true,
        neighborhood: true,
        street: true,
        houseNumber: true,
        residenceLat: true,
        residenceLng: true,
        residenceZoneId: true,
        currentZoneId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Descriptografa campos sensíveis antes de retornar
    const sensitiveFields = [
      'phone',
      'cep',
      'street',
      'houseNumber',
      'neighborhood',
      'pixKeyRandom',
      'pixKeyPhone',
      'pixKeyEmail',
      'pixKeyCpf',
    ];

    const decryptedUser = await this.encryptionService.decryptObject(
      user,
      sensitiveFields,
      user.email,
    );

    return {
      ...decryptedUser,
      residence_lat: decryptedUser.residenceLat,
      residence_lng: decryptedUser.residenceLng,
      residence_zone_id: decryptedUser.residenceZoneId,
      current_zone_id: decryptedUser.currentZoneId,
    };
  }

  async createFromFirebase(data: {
    email: string;
    name: string;
    firebaseUid: string;
    avatarUrl?: string;
    authProvider: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new ConflictException('E-mail já está em uso');
    }

    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        firebaseUid: data.firebaseUid,
        avatarUrl: data.avatarUrl,
        authProvider: data.authProvider,
        role: 'USER',
      },
    });
  }

  async linkFirebase(userId: string, firebaseUid: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { firebaseUid, authProvider: 'google' },
    });
  }

  async updateRole(id: string, role: string) {
    await this.ensureExists(id);
    const allowed = ['USER', 'MANAGER', 'ADMIN', 'SUPPORT'];
    if (!allowed.includes(role)) {
      throw new Error(`Role inválida: ${role}`);
    }
    return this.prisma.user.update({ where: { id }, data: { role }, select: { id: true, email: true, role: true } });
  }

  async blockUser(targetId: string, actorId: string, actorEmail: string, reason?: string) {
    const target = await this.ensureExists(targetId);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isBlocked: true, blockedReason: reason ?? null, blockedAt: new Date(), blockedBy: actorId },
    });
    await this.createAuditLog({ actorId, actorEmail, targetId, targetEmail: target.email, action: 'block_user', entity: 'User', entityId: targetId, details: { reason } });
    return { success: true };
  }

  async unblockUser(targetId: string, actorId: string, actorEmail: string) {
    const target = await this.ensureExists(targetId);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isBlocked: false, blockedReason: null, blockedAt: null, blockedBy: null },
    });
    await this.createAuditLog({ actorId, actorEmail, targetId, targetEmail: target.email, action: 'unblock_user', entity: 'User', entityId: targetId });
    return { success: true };
  }

  async banUser(targetId: string, actorId: string, actorEmail: string, reason?: string) {
    const target = await this.ensureExists(targetId);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isBanned: true, isBlocked: true, blockedReason: reason ?? null, blockedAt: new Date(), blockedBy: actorId },
    });
    await this.prisma.bannedEmail.upsert({
      where: { email: target.email },
      create: { email: target.email, reason, bannedBy: actorId },
      update: { reason, bannedBy: actorId },
    });
    await this.createAuditLog({ actorId, actorEmail, targetId, targetEmail: target.email, action: 'ban_user', entity: 'User', entityId: targetId, details: { reason } });
    return { success: true };
  }

  async unbanUser(targetId: string, actorId: string, actorEmail: string) {
    const target = await this.ensureExists(targetId);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isBanned: false, isBlocked: false, blockedReason: null, blockedAt: null, blockedBy: null },
    });
    await this.prisma.bannedEmail.deleteMany({ where: { email: target.email } });
    await this.createAuditLog({ actorId, actorEmail, targetId, targetEmail: target.email, action: 'unban_user', entity: 'User', entityId: targetId });
    return { success: true };
  }

  async verifyUser(targetId: string, actorId: string, actorEmail: string) {
    const target = await this.ensureExists(targetId);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isVerified: true, verifiedAt: new Date(), verifiedBy: actorId, verifiedByEmail: actorEmail },
    });
    await this.createAuditLog({ actorId, actorEmail, targetId, targetEmail: target.email, action: 'verify_user', entity: 'User', entityId: targetId });
    return { success: true };
  }

  async unverifyUser(targetId: string, actorId: string, actorEmail: string) {
    const target = await this.ensureExists(targetId);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isVerified: false, verifiedAt: null, verifiedBy: null, verifiedByEmail: null },
    });
    await this.createAuditLog({ actorId, actorEmail, targetId, targetEmail: target.email, action: 'unverify_user', entity: 'User', entityId: targetId });
    return { success: true };
  }

  async getAuditLogs(filters: { targetId?: string; actorId?: string; action?: string; limit?: number }) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...(filters.targetId ? { targetId: filters.targetId } : {}),
        ...(filters.actorId ? { actorId: filters.actorId } : {}),
        ...(filters.action ? { action: filters.action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
    });

    // Enrich content-related logs with actual entity data (title, image, price, etc.)
    const contentLogs = logs.filter((l) => l.action?.startsWith('content_') && l.entity && l.entityId);
    if (contentLogs.length === 0) return logs;

    // Group entity IDs by type
    const byType: Record<string, string[]> = {};
    for (const l of contentLogs) {
      if (!byType[l.entity]) byType[l.entity] = [];
      if (l.entityId && !byType[l.entity].includes(l.entityId)) byType[l.entity].push(l.entityId);
    }

    // Fetch all entities in parallel
    const entityMap = new Map<string, any>();
    const fetches: Promise<void>[] = [];

    if (byType.product?.length) {
      fetches.push(
        this.prisma.product.findMany({
          where: { id: { in: byType.product } },
          select: { id: true, title: true, description: true, price: true, images: true, category: true, condition: true, sellerName: true, sellerEmail: true, active: true },
        }).then((items) => items.forEach((i) => entityMap.set(`product:${i.id}`, { ...i, _entityType: 'product', _entityLabel: 'Produto' }))),
      );
    }
    if (byType.service?.length) {
      fetches.push(
        this.prisma.service.findMany({
          where: { id: { in: byType.service } },
          select: { id: true, title: true, description: true, pricePerHour: true, images: true, serviceType: true, providerName: true, providerEmail: true, active: true },
        }).then((items) => items.forEach((i) => entityMap.set(`service:${i.id}`, { ...i, _entityType: 'service', _entityLabel: 'Serviço' }))),
      );
    }
    if (byType.project?.length) {
      fetches.push(
        this.prisma.project.findMany({
          where: { id: { in: byType.project } },
          select: { id: true, title: true, description: true, imageUrl: true, status: true, targetAmount: true, ownerEmail: true },
        }).then((items) => items.forEach((i) => entityMap.set(`project:${i.id}`, { ...i, _entityType: 'project', _entityLabel: 'Projeto' }))),
      );
    }
    if (byType.news?.length) {
      fetches.push(
        this.prisma.news.findMany({
          where: { id: { in: byType.news } },
          select: { id: true, title: true, summary: true, imageUrl: true },
        }).then((items) => items.forEach((i) => entityMap.set(`news:${i.id}`, { ...i, _entityType: 'news', _entityLabel: 'Notícia' }))),
      );
    }
    if (byType.comment?.length) {
      fetches.push(
        this.prisma.newsComment.findMany({
          where: { id: { in: byType.comment } },
          select: { id: true, content: true, newsId: true },
        }).then((items) => items.forEach((i) => entityMap.set(`comment:${i.id}`, { ...i, title: i.content?.slice(0, 80), _entityType: 'comment', _entityLabel: 'Comentário' }))),
      );
    }

    await Promise.all(fetches);

    // Also fetch current moderation state for each entity
    const modEntities = contentLogs
      .filter((l) => l.entity && l.entityId)
      .map((l) => ({ entityType: l.entity, entityId: l.entityId! }));
    const modRecords = modEntities.length > 0
      ? await this.prisma.contentModeration.findMany({
          where: { OR: modEntities.map((e) => ({ entityType: e.entityType, entityId: e.entityId })) },
        })
      : [];
    const modMap = new Map(modRecords.map((m) => [`${m.entityType}:${m.entityId}`, m]));

    return logs.map((log) => {
      if (!log.action?.startsWith('content_') || !log.entity || !log.entityId) return log;
      const key = `${log.entity}:${log.entityId}`;
      const entity = entityMap.get(key) || null;
      const currentMod = modMap.get(key) || null;
      return {
        ...log,
        _content: entity,
        _currentModeration: currentMod ? {
          status: currentMod.status,
          managerNotice: currentMod.managerNotice,
          expiresAt: currentMod.expiresAt,
        } : null,
      };
    });
  }

  async getUserActivity(userId: string) {
    const user = await this.ensureExists(userId);
    const [products, services, projects, comments, orders, news, auditLogs] = await Promise.all([
      this.prisma.product.findMany({
        where: { sellerId: userId },
        select: { id: true, title: true, description: true, price: true, category: true, quantityAvailable: true, condition: true, images: true, active: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      this.prisma.service.findMany({
        where: { providerId: userId },
        select: { id: true, title: true, description: true, pricePerHour: true, serviceType: true, images: true, active: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      this.prisma.project.findMany({
        where: { ownerId: userId },
        select: { id: true, title: true, description: true, status: true, targetAmount: true, currentAmount: true, imageUrl: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      this.prisma.newsComment.findMany({
        where: { userId },
        select: { id: true, content: true, createdAt: true, newsId: true, news: { select: { title: true } } },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      this.prisma.order.findMany({
        where: { userId },
        select: { id: true, total: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      this.prisma.news.findMany({
        where: { authorId: userId },
        select: { id: true, title: true, summary: true, imageUrl: true, isPublished: true, likesCount: true, commentsCount: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      this.prisma.auditLog.findMany({ where: { targetId: userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return { user, products, services, projects, comments, orders, news, auditLogs };
  }

  async createAuditLog(data: { actorId?: string; actorEmail?: string; targetId?: string; targetEmail?: string; action: string; entity: string; entityId?: string; details?: any; ipAddress?: string }) {
    return this.prisma.auditLog.create({ data });
  }

  async listUsers(limit = 500) {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, email: true, name: true, role: true, avatarUrl: true,
        phone: true, city: true, state: true, createdAt: true, updatedAt: true,
        isBlocked: true, isBanned: true, blockedReason: true, blockedAt: true, blockedBy: true,
        isVerified: true, verifiedAt: true, verifiedByEmail: true,
        lastLoginAt: true,
      },
    });
    return users.map(u => ({
      ...u,
      full_name: u.name,
      user_role: u.role?.toLowerCase(),
      avatar_url: u.avatarUrl,
      created_date: u.createdAt,
      is_blocked: u.isBlocked,
      is_banned: u.isBanned,
      is_verified: u.isVerified,
      last_login_at: u.lastLoginAt,
      blocked_reason: u.blockedReason,
      blocked_at: u.blockedAt,
    }));
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }
}


