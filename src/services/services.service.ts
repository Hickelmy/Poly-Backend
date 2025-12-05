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
      else if (!isNaN(Number(value)) && key !== 'providerEmail') {
        parsed = Number(value);
      }
      let prismaKey = key;
      if (key === 'provider_email') prismaKey = 'providerEmail';
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
      if (field === 'created_date') prismaField = 'createdAt';
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
      service_type: s.serviceType,
      reviews_count: s.reviewsCount,
      provider_name: s.providerName,
      provider_email: s.providerEmail,
    }));
  }

  async create(data: any, user: { userId: string; email: string }) {
    const created = await this.prisma.service.create({
      data: {
        title: data.title,
        description: data.description,
        price: data.price,
        priceType: data.price_type ?? data.priceType ?? 'servico',
        serviceType: data.service_type ?? data.serviceType,
        images: data.images ?? [],
        active: data.active ?? true,
        providerId: user.userId,
        providerEmail: user.email,
        providerName: data.provider_name ?? data.providerName ?? user.email,
      },
    });
    return {
      ...created,
      created_date: created.createdAt,
      price_type: created.priceType,
      service_type: created.serviceType,
      reviews_count: created.reviewsCount,
      provider_name: created.providerName,
      provider_email: created.providerEmail,
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
        price: data.price ?? existing.price,
        priceType: data.price_type ?? data.priceType ?? existing.priceType,
        serviceType: data.service_type ?? data.serviceType ?? existing.serviceType,
        images: data.images ?? existing.images,
        active: data.active ?? existing.active,
      },
    });

    return {
      ...updated,
      created_date: updated.createdAt,
      price_type: updated.priceType,
      service_type: updated.serviceType,
      reviews_count: updated.reviewsCount,
      provider_name: updated.providerName,
      provider_email: updated.providerEmail,
    };
  }

  async delete(id: string) {
    await this.prisma.service.delete({ where: { id } });
    return { success: true };
  }
}


