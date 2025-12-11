import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Transforma campos camelCase para snake_case para compatibilidade com frontend
function transformZone(zone: any) {
  if (!zone) return zone;
  return {
    id: zone.id,
    name: zone.name,
    description: zone.description,
    color: zone.color,
    active: zone.active,
    polygon_geojson: zone.polygonGeojson,
    center_lat: zone.centerLat,
    center_lng: zone.centerLng,
    created_at: zone.createdAt,
    updated_at: zone.updatedAt,
    _count: zone._count,
  };
}

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    name: string;
    description?: string;
    color?: string;
    polygonGeojson?: any;
    polygon_geojson?: any; // Suporte a snake_case do frontend
    centerLat?: number;
    center_lat?: number; // Suporte a snake_case do frontend
    centerLng?: number;
    center_lng?: number; // Suporte a snake_case do frontend
  }) {
    if (!data.name) {
      throw new BadRequestException('Nome da zona é obrigatório');
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
      },
    });

    return transformZone(zone);
  }

  async findAll(params?: {
    active?: boolean;
    orderBy?: string;
    limit?: number;
  }) {
    const where: any = {};
    
    if (params?.active !== undefined) {
      where.active = params.active;
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

    return zones.map(transformZone);
  }

  async findOne(id: string) {
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
  }) {
    const existingZone = await this.prisma.zone.findUnique({ where: { id } });
    
    if (!existingZone) {
      throw new NotFoundException('Zona não encontrada');
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
      },
    });

    return transformZone(updatedZone);
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

  // Get zone statistics
  async getStats(id: string) {
    const zone = await this.findOne(id);

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
}

