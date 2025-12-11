import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ProductFilter {
  [key: string]: any;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filters: ProductFilter) {
    const where: ProductFilter = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      let parsed: any = value;
      if (value === 'true' || value === true) parsed = true;
      else if (value === 'false' || value === false) parsed = false;
      else if (!isNaN(Number(value)) && key !== 'sellerEmail' && key !== 'seller_email' && key !== 'zone_id' && key !== 'zoneId') {
        parsed = Number(value);
      }
      let prismaKey = key;
      if (key === 'seller_email') prismaKey = 'sellerEmail';
      if (key === 'zone_id') prismaKey = 'zoneId';
      where[prismaKey] = parsed;
    });
    return where;
  }

  async findMany(params: { sort?: string; limit?: number; filters?: ProductFilter }) {
    const { sort, limit, filters = {} } = params;

    let orderBy: any = { createdAt: 'desc' };
    if (sort) {
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      let prismaField = field;
      // Mapear campos do frontend para campos do Prisma
      if (field === 'created_date' || field === 'recent') prismaField = 'createdAt';
      if (field === 'updated_date') prismaField = 'updatedAt';
      if (field === 'quantity_available') prismaField = 'quantityAvailable';
      orderBy = { [prismaField]: desc ? 'desc' : 'asc' };
    }

    const where = this.buildWhere(filters);

    const items = await this.prisma.product.findMany({
      where,
      orderBy,
      take: limit && Number.isFinite(limit) ? limit : undefined,
    });

    // Adapter para o frontend, adicionando campos em snake_case
    return items.map((p) => ({
      ...p,
      created_date: p.createdAt,
      quantity_available: p.quantityAvailable,
      unit_type: p.unitType,
      seller_name: p.sellerName,
      seller_email: p.sellerEmail,
      zone_id: p.zoneId,
    }));
  }

  async create(data: any, user: { userId: string; email: string }) {
    const created = await this.prisma.product.create({
      data: {
        title: data.title,
        description: data.description,
        price: data.price,
        quantityAvailable: data.quantity_available ?? data.quantityAvailable ?? 0,
        category: data.category,
        condition: data.condition,
        unitType: data.unit_type ?? data.unitType,
        images: data.images ?? [],
        active: data.active ?? true,
        sellerId: user.userId,
        sellerEmail: user.email,
        sellerName: data.seller_name ?? data.sellerName ?? data.seller_email ?? user.email,
        zoneId: data.zone_id ?? data.zoneId ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
      },
    });
    return {
      ...created,
      created_date: created.createdAt,
      quantity_available: created.quantityAvailable,
      unit_type: created.unitType,
      seller_name: created.sellerName,
      seller_email: created.sellerEmail,
      zone_id: created.zoneId,
    };
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Produto não encontrado');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        description: data.description ?? existing.description,
        price: data.price ?? existing.price,
        quantityAvailable:
          data.quantity_available ?? data.quantityAvailable ?? existing.quantityAvailable,
        category: data.category ?? existing.category,
        condition: data.condition ?? existing.condition,
        unitType: data.unit_type ?? data.unitType ?? existing.unitType,
        images: data.images ?? existing.images,
        active: data.active ?? existing.active,
        zoneId: data.zone_id ?? data.zoneId ?? existing.zoneId,
        lat: data.lat ?? existing.lat,
        lng: data.lng ?? existing.lng,
      },
    });

    return {
      ...updated,
      created_date: updated.createdAt,
      quantity_available: updated.quantityAvailable,
      unit_type: updated.unitType,
      seller_name: updated.sellerName,
      seller_email: updated.sellerEmail,
      zone_id: updated.zoneId,
    };
  }

  async delete(id: string) {
    await this.prisma.product.delete({ where: { id } });
    return { success: true };
  }
}


