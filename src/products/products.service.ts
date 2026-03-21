import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZonesService } from '../zones/zones.service';
import { ModerationService } from '../moderation/moderation.service';

export interface ProductFilter {
  [key: string]: any;
}

// Calcula distância em km usando fórmula de Haversine
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zonesService: ZonesService,
    private readonly moderationService: ModerationService,
  ) {}

  private buildWhere(filters: ProductFilter) {
    const where: ProductFilter = {};
    
    // Mapeamento de campos snake_case para camelCase
    const fieldMapping: Record<string, string> = {
      'seller_id': 'sellerId',
      'seller_email': 'sellerEmail',
      'seller_name': 'sellerName',
      'zone_id': 'zoneId',
      'quantity_available': 'quantityAvailable',
      'unit_type': 'unitType',
      'created_date': 'createdAt',
      'updated_date': 'updatedAt',
    };
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      
      // Converte snake_case para camelCase
      const prismaKey = fieldMapping[key] || key;
      
      let parsed: any = value;
      if (value === 'true' || value === true) parsed = true;
      else if (value === 'false' || value === false) parsed = false;
      else if (!isNaN(Number(value)) && key !== 'sellerEmail' && key !== 'seller_email' && key !== 'zone_id' && key !== 'zoneId' && key !== 'seller_id') {
        parsed = Number(value);
      }
      
      where[prismaKey] = parsed;
    });
    return where;
  }

  async findMany(params: { 
    sort?: string; 
    limit?: number; 
    filters?: ProductFilter;
    userLat?: number;
    userLng?: number;
    userId?: string;
    userRole?: string;
  }) {
    const { sort, limit, filters = {}, userLat, userLng, userId, userRole } = params;
    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';

    // Remove userLat e userLng dos filtros (não são campos do banco)
    const { userLat: _uLat, userLng: _uLng, user_lat: _uLat2, user_lng: _uLng2, ...cleanFilters } = filters;

    // Zonas exclusivas: gestores veem tudo; outros só globais + zonas vinculadas ao perfil
    const accessibleZoneIds = await this.zonesService.getAccessibleZoneIds(userId, { isAdmin });
    const requestedZoneId = cleanFilters.zone_id ?? cleanFilters.zoneId;
    if (
      accessibleZoneIds !== null &&
      requestedZoneId &&
      !accessibleZoneIds.includes(requestedZoneId) &&
      requestedZoneId !== 'null'
    ) {
      delete cleanFilters.zone_id;
      delete cleanFilters.zoneId;
    }

    let orderBy: any = { createdAt: 'desc' };
    const sortByProximity = sort === 'proximity' || sort === 'distance';
    
    if (sort && !sortByProximity) {
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      let prismaField = field;
      // Mapear campos do frontend para campos do Prisma
      if (field === 'created_date' || field === 'recent') prismaField = 'createdAt';
      if (field === 'updated_date') prismaField = 'updatedAt';
      if (field === 'quantity_available') prismaField = 'quantityAvailable';
      orderBy = { [prismaField]: desc ? 'desc' : 'asc' };
    }

    const where = this.buildWhere(cleanFilters);

    // Filtro por zonas: gestores veem tudo; outros só globais + zonas vinculadas ao perfil
    if (accessibleZoneIds !== null) {
      if (accessibleZoneIds.length === 0) {
        where.zoneId = null;
      } else if (!where.zoneId) {
        where.OR = [
          { zoneId: null },
          { zoneId: { in: accessibleZoneIds } },
        ];
      }
    }

    const items = await this.prisma.product.findMany({
      where,
      orderBy: sortByProximity ? undefined : orderBy,
      take: !sortByProximity && limit && Number.isFinite(limit) ? limit : undefined,
    });

    // Enrich with moderation data and filter removed items
    const modEnriched = await this.enrichWithModeration(items, 'product', userId, isAdmin);

    // Enrich with seller verification status
    const sellerIds = [...new Set(modEnriched.map((i) => i.sellerId).filter(Boolean))];
    const verifiedMap = new Map<string, boolean>();
    if (sellerIds.length > 0) {
      const sellers = await this.prisma.user.findMany({
        where: { id: { in: sellerIds } },
        select: { id: true, isVerified: true },
      });
      sellers.forEach((s) => verifiedMap.set(s.id, s.isVerified));
    }
    const enriched = modEnriched.map((item) => ({
      ...item,
      _sellerVerified: item.sellerId ? (verifiedMap.get(item.sellerId) ?? false) : false,
    }));

    if (sortByProximity && userLat != null && userLng != null) {
      const itemsWithDistance = enriched.map((item) => {
        let dist = Infinity;
        if (item.lat != null && item.lng != null) {
          dist = haversineDistance(userLat, userLng, item.lat, item.lng);
        }
        return { ...item, _distance: dist };
      });

      itemsWithDistance.sort((a, b) => {
        if (a._distance === b._distance) {
          return (a.title || '').localeCompare(b.title || '');
        }
        return a._distance - b._distance;
      });

      const sliced = limit && Number.isFinite(limit)
        ? itemsWithDistance.slice(0, limit)
        : itemsWithDistance;

      return sliced.map(({ _distance, ...rest }) => ({
        ...rest,
        distance: _distance === Infinity ? null : Math.round(_distance * 10) / 10,
      }));
    }

    return enriched;
  }

  /**
   * Bulk-fetch ContentModeration records and attach to items.
   * - Removes items with status='removed' (unless owner or admin)
   * - Checks expiresAt and treats expired moderation as 'active'
   * - Attaches _moderation field with status, managerNotice, approval info
   */
  private async enrichWithModeration(items: any[], entityType: string, userId?: string, isAdmin = false) {
    if (items.length === 0) return items;

    const ids = items.map((i) => i.id);
    const mods = await this.prisma.contentModeration.findMany({
      where: { entityType, entityId: { in: ids } },
    });

    const modMap = new Map(mods.map((m) => [m.entityId, m]));

    const result = items
      .map((item) => {
        const mod = modMap.get(item.id);
        if (!mod) return item;

        // Check if moderation has expired
        const isExpired = mod.expiresAt && new Date(mod.expiresAt) < new Date();
        const effectiveStatus = isExpired ? 'active' : mod.status;

        return {
          ...item,
          _moderation: {
            status: effectiveStatus,
            managerNotice: mod.managerNotice,
            noticeVisible: mod.noticeVisible ?? true,
            wasEdited: mod.wasEdited,
            approvedAt: mod.approvedAt,
            approvedByEmail: mod.approvedByEmail,
            approvalNote: mod.approvalNote,
            expiresAt: mod.expiresAt,
          },
        };
      })
      .filter((item) => {
        const status = item._moderation?.status;
        if (status === 'removed') {
          const ownerId = item.sellerId ?? item.providerId ?? item.ownerId ?? item.authorId;
          return isAdmin || (userId && ownerId === userId);
        }
        return true;
      });

    // Highlighted items go to the top (boost); restricted go to the end (shadow ban)
    const highlighted = result.filter((i) => i._moderation?.status === 'highlighted');
    const normal = result.filter((i) => !['highlighted', 'restricted'].includes(i._moderation?.status));
    const restricted = result.filter((i) => i._moderation?.status === 'restricted');
    return [...highlighted, ...normal, ...restricted];
  }

  async findOne(id: string, userId?: string, userRole?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    // Zona exclusiva: gestores veem tudo; outros só se for global ou zona vinculada ao perfil
    if (product.zoneId) {
      const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
      const accessibleZoneIds = await this.zonesService.getAccessibleZoneIds(userId, { isAdmin });
      if (accessibleZoneIds !== null && !accessibleZoneIds.includes(product.zoneId)) {
        throw new NotFoundException('Produto não encontrado');
      }
    }

    return product;
  }

  async create(data: any, user: { userId: string; email: string }) {
    const imageUrls = (data.images || []).filter((u: string) => u && (u.startsWith('http') || u.startsWith('data:')));
    const mod = await this.moderationService.moderateTextAndImages(
      [data.title, data.description].filter(Boolean).join('\n\n'),
      imageUrls,
    );
    if (mod.flagged) {
      throw new BadRequestException(
        'Conteúdo não permitido. Revise o texto e as imagens antes de publicar.',
      );
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true },
    });
    const resolvedSellerName = data.seller_name ?? data.sellerName ?? dbUser?.name ?? user.email;

    const created = await this.prisma.product.create({
      data: {
        title: data.title,
        description: data.description,
        price: data.price,
        quantityAvailable: data.quantity_available ?? data.quantityAvailable ?? 0,
        category: data.category,
        condition: data.condition,
        unitType: data.unit_type ?? data.unitType,
        deliveryTypes: data.deliveryTypes ?? data.delivery_types ?? [],
        shippingPaidBy: data.shippingPaidBy ?? data.shipping_paid_by ?? 'buyer',
        weightKg: data.weightKg ?? data.weight_kg ?? null,
        images: data.images ?? [],
        active: data.active ?? true,
        sellerId: user.userId,
        sellerEmail: user.email,
        sellerName: resolvedSellerName,
        zoneId: data.zone_id ?? data.zoneId ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        discountPercent: data.discountPercent ?? data.discount_percent ?? null,
        paymentMethods: data.paymentMethods ?? data.payment_methods ?? [],
        sellerDelivery: data.sellerDelivery ?? data.seller_delivery ?? false,
      },
    });
    // Retorna apenas os campos do Prisma (camelCase)
    return created;
  }

  async update(id: string, data: any, requestingUserId?: string, requestingUserRole?: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Produto não encontrado');
    }
    const isAdmin = requestingUserRole === 'ADMIN' || requestingUserRole === 'MANAGER';
    const isOwner = existing.sellerId === requestingUserId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Você não tem permissão para editar este produto');
    }

    // Atualiza apenas campos enviados (PATCH parcial)
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.quantity_available !== undefined || data.quantityAvailable !== undefined) {
      updateData.quantityAvailable = data.quantity_available ?? data.quantityAvailable;
    }
    if (data.category !== undefined) updateData.category = data.category;
    if (data.condition !== undefined) updateData.condition = data.condition;
    if (data.unit_type !== undefined || data.unitType !== undefined) {
      updateData.unitType = data.unit_type ?? data.unitType;
    }
    if (data.deliveryTypes !== undefined || data.delivery_types !== undefined) {
      updateData.deliveryTypes = data.deliveryTypes ?? data.delivery_types;
    }
    if (data.shippingPaidBy !== undefined || data.shipping_paid_by !== undefined) {
      updateData.shippingPaidBy = data.shippingPaidBy ?? data.shipping_paid_by;
    }
    if (data.weightKg !== undefined || data.weight_kg !== undefined) {
      updateData.weightKg = data.weightKg ?? data.weight_kg;
    }
    if (data.images !== undefined) updateData.images = data.images;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.zone_id !== undefined || data.zoneId !== undefined) {
      updateData.zoneId = data.zone_id ?? data.zoneId;
    }
    if (data.lat !== undefined) updateData.lat = data.lat;
    if (data.lng !== undefined) updateData.lng = data.lng;
    if (data.discountPercent !== undefined || data.discount_percent !== undefined) updateData.discountPercent = data.discountPercent ?? data.discount_percent;
    if (data.paymentMethods !== undefined || data.payment_methods !== undefined) updateData.paymentMethods = data.paymentMethods ?? data.payment_methods;
    if (data.sellerDelivery !== undefined || data.seller_delivery !== undefined) updateData.sellerDelivery = data.sellerDelivery ?? data.seller_delivery;

    if (Object.keys(updateData).length === 0) {
      return existing;
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: updateData,
    });

    return updated;
  }

  async delete(id: string, requestingUserId?: string, requestingUserRole?: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Produto não encontrado');
    const isAdmin = requestingUserRole === 'ADMIN' || requestingUserRole === 'MANAGER';
    const isOwner = existing.sellerId === requestingUserId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Você não tem permissão para excluir este produto');
    }
    await this.prisma.product.delete({ where: { id } });
    return { success: true };
  }
}


