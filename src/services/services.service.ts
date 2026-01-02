import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ServiceFilter {
  [key: string]: any;
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filters: ServiceFilter) {
    const where: ServiceFilter = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      let parsed: any = value;
      if (value === 'true' || value === true) parsed = true;
      else if (value === 'false' || value === false) parsed = false;
      else if (!isNaN(Number(value)) && key !== 'providerEmail' && key !== 'provider_email' && key !== 'zone_id' && key !== 'zoneId') {
        parsed = Number(value);
      }
      let prismaKey = key;
      if (key === 'provider_email') prismaKey = 'providerEmail';
      if (key === 'zone_id') prismaKey = 'zoneId';
      where[prismaKey] = parsed;
    });
    return where;
  }

  async findMany(params: { sort?: string; limit?: number; filters?: ServiceFilter }) {
    const { sort, limit, filters = {} } = params;

    let orderBy: any = { createdAt: 'desc' };
    if (sort) {
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      let prismaField = field;
      // Mapear campos do frontend para campos do Prisma
      if (field === 'created_date' || field === 'recent') prismaField = 'createdAt';
      if (field === 'updated_date') prismaField = 'updatedAt';
      if (field === 'reviews_count') prismaField = 'reviewsCount';
      orderBy = { [prismaField]: desc ? 'desc' : 'asc' };
    }

    const where = this.buildWhere(filters);

    const items = await this.prisma.service.findMany({
      where,
      orderBy,
      take: limit && Number.isFinite(limit) ? limit : undefined,
    });

    // Adapter para o frontend, adicionando campos em snake_case
    return items.map((s) => ({
      ...s,
      created_date: s.createdAt,
      price_type: s.priceType,
      price_per_hour: s.pricePerHour,
      price_per_day: s.pricePerDay,
      price_per_service: s.pricePerService,
      service_type: s.serviceType,
      reviews_count: s.reviewsCount,
      provider_name: s.providerName,
      provider_email: s.providerEmail,
      zone_id: s.zoneId,
      availability_schedule: s.availabilitySchedule,
    }));
  }

  async create(data: any, user: { userId: string; email: string }) {
    const created = await this.prisma.service.create({
      data: {
        title: data.title,
        description: data.description,
        price: data.price ?? null,
        priceType: data.price_type ?? data.priceType ?? 'servico', // Valor padrão para compatibilidade
        pricePerHour: data.price_per_hour ?? data.pricePerHour ?? null,
        pricePerDay: data.price_per_day ?? data.pricePerDay ?? null,
        pricePerService: data.price_per_service ?? data.pricePerService ?? null,
        serviceType: data.service_type ?? data.serviceType,
        images: data.images ?? [],
        active: data.active ?? true,
        providerId: user.userId,
        providerEmail: user.email,
        providerName: data.provider_name ?? data.providerName ?? user.email,
        zoneId: data.zone_id ?? data.zoneId ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        availabilitySchedule: data.availability_schedule ?? data.availabilitySchedule ?? null,
      },
    });
    return {
      ...created,
      created_date: created.createdAt,
      price_type: created.priceType,
      price_per_hour: created.pricePerHour,
      price_per_day: created.pricePerDay,
      price_per_service: created.pricePerService,
      service_type: created.serviceType,
      reviews_count: created.reviewsCount,
      provider_name: created.providerName,
      provider_email: created.providerEmail,
      zone_id: created.zoneId,
      availability_schedule: created.availabilitySchedule,
    };
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.service.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Serviço não encontrado');
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        description: data.description ?? existing.description,
        price: data.price !== undefined ? data.price : existing.price,
        priceType: data.price_type ?? data.priceType ?? existing.priceType ?? 'servico', // Valor padrão para compatibilidade
        pricePerHour: data.price_per_hour !== undefined ? data.price_per_hour : data.pricePerHour ?? existing.pricePerHour,
        pricePerDay: data.price_per_day !== undefined ? data.price_per_day : data.pricePerDay ?? existing.pricePerDay,
        pricePerService: data.price_per_service !== undefined ? data.price_per_service : data.pricePerService ?? existing.pricePerService,
        serviceType: data.service_type ?? data.serviceType ?? existing.serviceType,
        images: data.images ?? existing.images,
        active: data.active ?? existing.active,
        zoneId: data.zone_id ?? data.zoneId ?? existing.zoneId,
        lat: data.lat ?? existing.lat,
        lng: data.lng ?? existing.lng,
        availabilitySchedule: data.availability_schedule ?? data.availabilitySchedule ?? existing.availabilitySchedule,
      },
    });

    return {
      ...updated,
      created_date: updated.createdAt,
      price_type: updated.priceType,
      price_per_hour: updated.pricePerHour,
      price_per_day: updated.pricePerDay,
      price_per_service: updated.pricePerService,
      service_type: updated.serviceType,
      reviews_count: updated.reviewsCount,
      provider_name: updated.providerName,
      provider_email: updated.providerEmail,
      zone_id: updated.zoneId,
      availability_schedule: updated.availabilitySchedule,
    };
  }

  async delete(id: string) {
    await this.prisma.service.delete({ where: { id } });
    return { success: true };
  }
}


