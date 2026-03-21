import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class InviteLinksService {
  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    return randomBytes(4).toString('hex').toUpperCase(); // 8 caracteres hex
  }

  /** Verifica se o usuario eh admin da zona (UserZoneAccess.role=ADMIN) ou admin/manager da plataforma */
  async assertZoneAdmin(userId: string, userRole: string, zoneId: string) {
    const isPlatformAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
    if (isPlatformAdmin) return;

    const access = await this.prisma.userZoneAccess.findUnique({
      where: { userId_zoneId: { userId, zoneId } },
    });

    if (!access || access.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas administradores da zona podem realizar esta ação');
    }
  }

  async create(data: {
    zoneId: string;
    maxUses?: number;
    expiresAt?: string;
    createdById: string;
    createdByEmail?: string;
  }) {
    const zone = await this.prisma.zone.findUnique({ where: { id: data.zoneId } });
    if (!zone) throw new NotFoundException('Zona não encontrada');

    const code = this.generateCode();

    const link = await this.prisma.inviteLink.create({
      data: {
        zoneId: data.zoneId,
        code,
        maxUses: data.maxUses ?? 0,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdById: data.createdById,
        createdByEmail: data.createdByEmail,
      },
      include: { zone: { select: { name: true } } },
    });

    return this.transform(link);
  }

  async findByZone(zoneId: string) {
    const links = await this.prisma.inviteLink.findMany({
      where: { zoneId },
      orderBy: { createdAt: 'desc' },
      include: {
        zone: { select: { name: true } },
        _count: { select: { usages: true } },
      },
    });
    return links.map((l) => this.transform(l));
  }

  async deactivate(id: string) {
    const link = await this.prisma.inviteLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Link não encontrado');

    await this.prisma.inviteLink.update({
      where: { id },
      data: { active: false },
    });

    return { success: true, message: 'Link desativado' };
  }

  async validate(code: string) {
    const link = await this.prisma.inviteLink.findUnique({
      where: { code: code.toUpperCase() },
      include: { zone: { select: { id: true, name: true, description: true, color: true } } },
    });

    if (!link || !link.active) {
      return { valid: false, message: 'Código inválido ou desativado' };
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return { valid: false, message: 'Este convite expirou' };
    }

    if (link.maxUses > 0 && link.usesCount >= link.maxUses) {
      return { valid: false, message: 'Este convite atingiu o limite de usos' };
    }

    return {
      valid: true,
      zone: link.zone,
    };
  }

  async join(code: string, userId: string, userEmail?: string) {
    const link = await this.prisma.inviteLink.findUnique({
      where: { code: code.toUpperCase() },
      include: { zone: true },
    });

    if (!link || !link.active) {
      throw new BadRequestException('Código de convite inválido ou desativado');
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new BadRequestException('Este convite expirou');
    }

    if (link.maxUses > 0 && link.usesCount >= link.maxUses) {
      throw new BadRequestException('Este convite atingiu o limite de usos');
    }

    if (!link.zone.active) {
      throw new BadRequestException('Esta zona está desativada');
    }

    // Verifica se ja eh membro
    const existing = await this.prisma.userZoneAccess.findUnique({
      where: { userId_zoneId: { userId, zoneId: link.zoneId } },
    });

    if (existing) {
      return { success: true, message: 'Você já é membro desta zona', zone_name: link.zone.name };
    }

    // Transacao: criar acesso + registrar uso + incrementar contador
    await this.prisma.$transaction([
      this.prisma.userZoneAccess.create({
        data: { userId, zoneId: link.zoneId, role: 'MEMBER' },
      }),
      this.prisma.inviteLinkUsage.create({
        data: { inviteLinkId: link.id, userId, userEmail },
      }),
      this.prisma.inviteLink.update({
        where: { id: link.id },
        data: { usesCount: { increment: 1 } },
      }),
    ]);

    return {
      success: true,
      message: `Bem-vindo à zona "${link.zone.name}"!`,
      zone_name: link.zone.name,
      zone_id: link.zoneId,
    };
  }

  private transform(link: any) {
    return {
      id: link.id,
      zone_id: link.zoneId,
      zone_name: link.zone?.name,
      code: link.code,
      max_uses: link.maxUses,
      uses_count: link.usesCount ?? link._count?.usages ?? 0,
      expires_at: link.expiresAt,
      created_by_email: link.createdByEmail,
      active: link.active,
      created_at: link.createdAt,
    };
  }
}
