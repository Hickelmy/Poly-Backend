import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Transforma campos camelCase para snake_case para compatibilidade com frontend
function transformZone(zone: any, includeAccessCode: boolean = false) {
  if (!zone) return zone;
  const result: any = {
    id: zone.id,
    name: zone.name,
    description: zone.description,
    color: zone.color,
    active: zone.active,
    is_public: zone.isPublic,
    polygon_geojson: zone.polygonGeojson,
    center_lat: zone.centerLat,
    center_lng: zone.centerLng,
    created_by_id: zone.createdById,
    created_by_email: zone.createdByEmail,
    created_at: zone.createdAt,
    updated_at: zone.updatedAt,
    _count: zone._count,
  };

  // Só inclui o código de acesso para admins
  if (includeAccessCode && zone.accessCode) {
    result.access_code = zone.accessCode;
  }

  return result;
}

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    name: string;
    description?: string;
    color?: string;
    polygonGeojson?: any;
    polygon_geojson?: any;
    centerLat?: number;
    center_lat?: number;
    centerLng?: number;
    center_lng?: number;
    isPublic?: boolean;
    is_public?: boolean;
    accessCode?: string;
    access_code?: string;
    createdById?: string;
    createdByEmail?: string;
  }) {
    if (!data.name) {
      throw new BadRequestException('Nome da zona é obrigatório');
    }

    const isPublic = data.isPublic ?? data.is_public ?? true;
    const accessCode = data.accessCode ?? data.access_code;

    // Se não for pública, precisa ter código de acesso
    if (!isPublic && !accessCode) {
      throw new BadRequestException('Zonas privadas precisam ter um código de acesso');
    }

    // Verifica se o código já existe
    if (accessCode) {
      const existingZone = await this.prisma.zone.findUnique({
        where: { accessCode },
      });
      if (existingZone) {
        throw new BadRequestException('Este código de acesso já está em uso');
      }
    }

    const zone = await this.prisma.zone.create({
      data: {
        name: data.name,
        description: data.description,
        color: data.color || '#14b8a6',
        polygonGeojson: data.polygonGeojson || data.polygon_geojson,
        centerLat: data.centerLat ?? data.center_lat,
        centerLng: data.centerLng ?? data.center_lng,
        active: true,
        isPublic,
        accessCode: accessCode || null,
        createdById: data.createdById,
        createdByEmail: data.createdByEmail,
      },
    });

    // Auto-criar UserZoneAccess com role=ADMIN para o criador
    if (data.createdById) {
      await this.prisma.userZoneAccess.create({
        data: {
          userId: data.createdById,
          zoneId: zone.id,
          role: 'ADMIN',
        },
      }).catch(() => {}); // Ignora se ja existe
    }

    return transformZone(zone, true);
  }

  async findAll(params?: {
    active?: boolean;
    orderBy?: string;
    limit?: number;
    userId?: string; // Para filtrar zonas baseado no acesso do usuário
    isAdmin?: boolean; // Se é admin, mostra todas
  }) {
    const where: any = {};
    
    if (params?.active !== undefined) {
      where.active = params.active;
    }

    // Se não for admin: só zonas vinculadas ao perfil (UserZoneAccess). Não mostra outras zonas.
    if (!params?.isAdmin && params?.userId) {
      const userAccesses = await this.prisma.userZoneAccess.findMany({
        where: { userId: params.userId },
        select: { zoneId: true },
      });
      const accessibleZoneIds = userAccesses.map(a => a.zoneId);
      where.id = { in: accessibleZoneIds };
    } else if (!params?.isAdmin) {
      // Usuário não logado - só zonas públicas
      where.isPublic = true;
    }

    const orderBy: any = {};
    if (params?.orderBy) {
      const [field, direction] = params.orderBy.startsWith('-')
        ? [params.orderBy.slice(1), 'desc']
        : [params.orderBy, 'asc'];
      
      // Mapear campos snake_case para camelCase do Prisma
      const fieldMap: Record<string, string> = {
        'created_date': 'createdAt',
        'updated_date': 'updatedAt',
        'created_at': 'createdAt',
        'updated_at': 'updatedAt',
      };
      
      const prismaField = fieldMap[field] || field;
      orderBy[prismaField] = direction;
    } else {
      orderBy.createdAt = 'desc';
    }

    const zones = await this.prisma.zone.findMany({
      where,
      orderBy,
      take: params?.limit,
      include: {
        _count: {
          select: {
            products: true,
            services: true,
            projects: true,
            residenceUsers: true,
          },
        },
      },
    });

    return zones.map(z => transformZone(z, params?.isAdmin));
  }

  async findOne(id: string, userId?: string, userRole?: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            services: true,
            projects: true,
            residenceUsers: true,
          },
        },
      },
    });

    if (!zone) {
      throw new NotFoundException('Zona não encontrada');
    }

    // Zona privada: gestores veem tudo; outros só se tiver UserZoneAccess
    if (!zone.isPublic) {
      const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
      const accessibleZoneIds = await this.getAccessibleZoneIds(userId, { isAdmin: false });
      const hasAccess = isAdmin || (accessibleZoneIds !== null && accessibleZoneIds.includes(id));
      if (!hasAccess) {
        throw new NotFoundException('Zona não encontrada');
      }
    }

    return transformZone(zone);
  }

  async update(id: string, data: {
    name?: string;
    description?: string;
    color?: string;
    polygonGeojson?: any;
    polygon_geojson?: any; // Suporte a snake_case do frontend
    centerLat?: number;
    center_lat?: number; // Suporte a snake_case do frontend
    centerLng?: number;
    center_lng?: number; // Suporte a snake_case do frontend
    active?: boolean;
    isPublic?: boolean;
    is_public?: boolean;
    accessCode?: string;
    access_code?: string;
  }) {
    const existingZone = await this.prisma.zone.findUnique({ where: { id } });
    
    if (!existingZone) {
      throw new NotFoundException('Zona não encontrada');
    }

    const isPublic = data.isPublic ?? data.is_public;
    const accessCode = data.accessCode ?? data.access_code;

    // Se está tornando privada, precisa ter código de acesso
    if (isPublic === false && !accessCode && !existingZone.accessCode) {
      throw new BadRequestException('Zonas privadas precisam ter um código de acesso');
    }

    // Verifica se o código já existe (se está sendo alterado)
    if (accessCode && accessCode !== existingZone.accessCode) {
      const zoneWithCode = await this.prisma.zone.findUnique({
        where: { accessCode },
      });
      if (zoneWithCode && zoneWithCode.id !== id) {
        throw new BadRequestException('Este código de acesso já está em uso');
      }
    }

    const updatedZone = await this.prisma.zone.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        color: data.color,
        polygonGeojson: data.polygonGeojson || data.polygon_geojson,
        centerLat: data.centerLat ?? data.center_lat,
        centerLng: data.centerLng ?? data.center_lng,
        active: data.active,
        isPublic: isPublic,
        accessCode: accessCode !== undefined ? (accessCode || null) : undefined,
      },
    });

    return transformZone(updatedZone, true);
  }

  async delete(id: string) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    
    if (!zone) {
      throw new NotFoundException('Zona não encontrada');
    }

    // Check if zone has associated items
    const counts = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            services: true,
            projects: true,
            residenceUsers: true,
          },
        },
      },
    });

    const totalItems = 
      (counts?._count?.products || 0) +
      (counts?._count?.services || 0) +
      (counts?._count?.projects || 0) +
      (counts?._count?.residenceUsers || 0);

    if (totalItems > 0) {
      throw new BadRequestException(
        `Não é possível excluir esta zona. Ela possui ${totalItems} itens associados.`,
      );
    }

    return this.prisma.zone.delete({ where: { id } });
  }

  // Get zone statistics (gestores veem tudo; outros só zonas com acesso)
  async getStats(id: string, userId?: string, userRole?: string) {
    const zone = await this.findOne(id, userId, userRole);
    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';

    if (!isAdmin && !zone.is_public) {
      const accessibleZoneIds = await this.getAccessibleZoneIds(userId, { isAdmin: false });
      if (accessibleZoneIds === null || !accessibleZoneIds.includes(id)) {
        throw new ForbiddenException('Você não tem acesso a esta zona');
      }
    }

    const [products, services, projects, users] = await Promise.all([
      this.prisma.product.count({ where: { zoneId: id } }),
      this.prisma.service.count({ where: { zoneId: id } }),
      this.prisma.project.count({ where: { zoneId: id } }),
      this.prisma.user.count({ where: { residenceZoneId: id } }),
    ]);

    return {
      zone,
      stats: {
        products,
        services,
        projects,
        users,
        total: products + services + projects,
      },
    };
  }

  // Entrar em uma zona usando código de acesso
  async joinWithCode(userId: string, accessCode: string) {
    if (!accessCode || accessCode.trim() === '') {
      throw new BadRequestException('Código de acesso é obrigatório');
    }

    const zone = await this.prisma.zone.findUnique({
      where: { accessCode: accessCode.trim().toUpperCase() },
    });

    if (!zone) {
      throw new NotFoundException('Código de acesso inválido');
    }

    if (!zone.active) {
      throw new ForbiddenException('Esta zona está desativada');
    }

    // Verifica se já tem acesso
    const existingAccess = await this.prisma.userZoneAccess.findUnique({
      where: {
        userId_zoneId: {
          userId,
          zoneId: zone.id,
        },
      },
    });

    if (existingAccess) {
      return {
        success: true,
        message: 'Você já tem acesso a esta zona',
        zone: transformZone(zone),
      };
    }

    // Cria o acesso
    await this.prisma.userZoneAccess.create({
      data: {
        userId,
        zoneId: zone.id,
      },
    });

    return {
      success: true,
      message: `Acesso à zona "${zone.name}" concedido com sucesso!`,
      zone: transformZone(zone),
    };
  }

  /**
   * Retorna os IDs das zonas às quais o usuário tem acesso (UserZoneAccess).
   * Usado para filtrar produtos, serviços, projetos e notícias por zona exclusiva.
   * - isAdmin (ADMIN/MANAGER): retorna null = sem restrição (gestores veem todas as zonas para fiscalização)
   * - userId undefined: retorna [] (apenas dados globais zoneId=null)
   * - userId definido: retorna IDs das zonas em UserZoneAccess
   */
  async getAccessibleZoneIds(
    userId: string | undefined,
    options?: { isAdmin?: boolean },
  ): Promise<string[] | null> {
    if (options?.isAdmin) return null; // Gestores/admins veem todas as zonas
    if (!userId) return [];
    const accesses = await this.prisma.userZoneAccess.findMany({
      where: { userId },
      select: { zoneId: true },
    });
    return accesses.map((a) => a.zoneId);
  }

  // Lista zonas que o usuário tem acesso
  async getUserZones(userId: string) {
    const accesses = await this.prisma.userZoneAccess.findMany({
      where: { userId },
      include: {
        zone: {
          include: {
            _count: {
              select: {
                products: true,
                services: true,
                projects: true,
              },
            },
          },
        },
      },
    });

    return accesses.map(a => ({
      ...transformZone(a.zone),
      zone_role: a.role,
      joined_at: a.createdAt,
    }));
  }

  /** Verifica se o usuario eh admin da zona ou da plataforma */
  async assertZoneAdminOrPlatformAdmin(userId: string, userRole: string, zoneId: string) {
    if (userRole === 'ADMIN' || userRole === 'MANAGER') return;
    const access = await this.prisma.userZoneAccess.findUnique({
      where: { userId_zoneId: { userId, zoneId } },
    });
    if (!access || access.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas administradores da zona podem realizar esta ação');
    }
  }

  // Listar membros de uma zona (com codigo de convite usado)
  async getMembers(zoneId: string) {
    const accesses = await this.prisma.userZoneAccess.findMany({
      where: { zoneId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            isVerified: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Buscar usages de convite para esta zona em uma unica query
    const usages = await this.prisma.inviteLinkUsage.findMany({
      where: {
        inviteLink: { zoneId },
      },
      include: {
        inviteLink: { select: { code: true } },
      },
    });

    const usageMap = new Map<string, string>();
    for (const u of usages) {
      usageMap.set(u.userId, u.inviteLink.code);
    }

    return accesses.map((a) => ({
      id: a.id,
      user_id: a.userId,
      zone_id: a.zoneId,
      role: a.role,
      name: a.user.name,
      email: a.user.email,
      avatar_url: a.user.avatarUrl,
      is_verified: a.user.isVerified,
      last_login_at: a.user.lastLoginAt,
      joined_at: a.createdAt,
      invite_code: usageMap.get(a.userId) || null,
    }));
  }

  // Remover membro de uma zona
  async removeMember(zoneId: string, memberId: string) {
    const access = await this.prisma.userZoneAccess.findFirst({
      where: { zoneId, userId: memberId },
    });
    if (!access) throw new NotFoundException('Membro não encontrado nesta zona');

    await this.prisma.userZoneAccess.delete({
      where: { userId_zoneId: { userId: memberId, zoneId } },
    });

    return { success: true, message: 'Membro removido com sucesso' };
  }

  // Remove acesso do usuário a uma zona
  async leaveZone(userId: string, zoneId: string) {
    const access = await this.prisma.userZoneAccess.findUnique({
      where: {
        userId_zoneId: {
          userId,
          zoneId,
        },
      },
    });

    if (!access) {
      throw new NotFoundException('Você não tem acesso a esta zona');
    }

    await this.prisma.userZoneAccess.delete({
      where: {
        userId_zoneId: {
          userId,
          zoneId,
        },
      },
    });

    return {
      success: true,
      message: 'Acesso removido com sucesso',
    };
  }
}

