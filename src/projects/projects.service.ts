import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZonesService } from '../zones/zones.service';
import { ModerationService } from '../moderation/moderation.service';

export interface ProjectFilter {
  [key: string]: any;
}

/**
 * Calcula os votos mínimos necessários baseado no valor do projeto.
 * Fórmula progressiva para evitar fraudes:
 * - Até R$ 2.000: 10 votos (padrão)
 * - De R$ 2.000 a R$ 10.000: 10 + ((valor - 2000) / 500) votos (1 voto a cada R$ 500)
 * - De R$ 10.000 a R$ 50.000: 26 + ((valor - 10000) / 1000) votos (1 voto a cada R$ 1.000)
 * - Acima de R$ 50.000: 66 + ((valor - 50000) / 2000) votos (1 voto a cada R$ 2.000)
 */
function calculateMinVotes(amount: number): number {
  if (!amount || amount <= 0) return 10;
  
  if (amount <= 2000) {
    return 10;
  } else if (amount <= 10000) {
    // De 2000 a 10000: 10 votos base + 1 voto a cada 500 reais
    return Math.ceil(10 + (amount - 2000) / 500);
  } else if (amount <= 50000) {
    // De 10000 a 50000: 26 votos base + 1 voto a cada 1000 reais
    return Math.ceil(26 + (amount - 10000) / 1000);
  } else {
    // Acima de 50000: 66 votos base + 1 voto a cada 2000 reais
    return Math.ceil(66 + (amount - 50000) / 2000);
  }
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zonesService: ZonesService,
    private readonly moderationService: ModerationService,
  ) {}

  private buildWhere(filters: ProjectFilter) {
    const where: any = {};

    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;

      let prismaKey = key;
      if (key === 'id') prismaKey = 'id';
      if (key === 'category') prismaKey = 'category';
      if (key === 'status') prismaKey = 'status';
      if (key === 'owner_id') prismaKey = 'ownerId';
      if (key === 'owner_email') prismaKey = 'ownerEmail';
      if (key === 'zone_id') prismaKey = 'zoneId';

      if (key === 'project_id') prismaKey = 'projectId';

      if (typeof value === 'string' && value.includes(',')) {
        const parts = value.split(',').map((v) => v.trim());
        where[prismaKey] = { in: parts };
      } else {
        where[prismaKey] = value;
      }
    });

    return where;
  }

  async findMany(params: { sort?: string; limit?: number; filters?: ProjectFilter; userId?: string; userRole?: string }) {
    const { sort, limit, filters = {}, userId, userRole } = params;
    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';

    // Zonas exclusivas: gestores veem tudo; outros só globais + zonas vinculadas ao perfil
    const cleanFilters = { ...filters };
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
    if (sort) {
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      let prismaField = field;
      // Mapear campos do frontend para campos do Prisma
      if (field === 'created_date' || field === 'recent') prismaField = 'createdAt';
      if (field === 'updated_date') prismaField = 'updatedAt';
      if (field === 'target_amount') prismaField = 'targetAmount';
      if (field === 'current_amount') prismaField = 'currentAmount';
      if (field === 'votes_count') prismaField = 'votesCount';
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

    const items = await this.prisma.project.findMany({
      where,
      orderBy,
      take: limit && Number.isFinite(limit) ? limit : undefined,
      include: {
        expenses: true,
        votes: true,
      },
    });

    return items.map((p) => {
      const upVotes =
        p.votes?.filter((v) => v.type === 'up').length ?? 0;
      const downVotes =
        p.votes?.filter((v) => v.type === 'down').length ?? 0;

      return {
        ...p,
        created_date: p.createdAt,
        updated_date: p.updatedAt,
        short_description: p.shortDescription,
        target_amount: p.targetAmount,
        current_amount: p.currentAmount,
        min_votes: p.minVotes,
        votes_count: p.votesCount,
        up_votes_count: upVotes,
        down_votes_count: downVotes,
        funding_deadline: p.fundingDeadline,
        owner_id: p.ownerId,
        owner_email: p.ownerEmail,
        location_address: p.locationAddress,
        latitude: p.latitude,
        longitude: p.longitude,
        lat: p.latitude, // Alias for map compatibility
        lng: p.longitude,
        zone_id: p.zoneId,
        expenses_total: p.expensesTotal,
        expenses: p.expenses.map((e) => ({
          ...e,
          project_id: e.projectId,
          created_date: e.createdAt,
          updated_date: e.updatedAt,
        })),
      };
    });
  }

  async findOne(id: string, userId?: string, userRole?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        expenses: true,
        votes: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Projeto não encontrado');
    }

    // Zona exclusiva: gestores veem tudo; outros só se for global ou zona vinculada ao perfil
    if (project.zoneId) {
      const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
      const accessibleZoneIds = await this.zonesService.getAccessibleZoneIds(userId, { isAdmin });
      if (accessibleZoneIds !== null && !accessibleZoneIds.includes(project.zoneId)) {
        throw new NotFoundException('Projeto não encontrado');
      }
    }

    const upVotes =
      project.votes?.filter((v) => v.type === 'up').length ?? 0;
    const downVotes =
      project.votes?.filter((v) => v.type === 'down').length ?? 0;

    return {
      ...project,
      created_date: project.createdAt,
      updated_date: project.updatedAt,
      short_description: project.shortDescription,
      target_amount: project.targetAmount,
      current_amount: project.currentAmount,
      min_votes: project.minVotes,
      votes_count: project.votesCount,
      up_votes_count: upVotes,
      down_votes_count: downVotes,
      funding_deadline: project.fundingDeadline,
      owner_id: project.ownerId,
      owner_email: project.ownerEmail,
      location_address: project.locationAddress,
      latitude: project.latitude,
      longitude: project.longitude,
      lat: project.latitude,
      lng: project.longitude,
      zone_id: project.zoneId,
      expenses_total: project.expensesTotal,
      expenses: project.expenses.map((e) => ({
        ...e,
        project_id: e.projectId,
        created_date: e.createdAt,
        updated_date: e.updatedAt,
      })),
    };
  }

  async create(data: any, user: { userId: string; email: string }) {
    const {
      expenses = [],
      expenses_total,
      owner_id,
      owner_email,
      target_amount,
      current_amount,
      min_votes,
      votes_count,
      funding_deadline,
      short_description,
      location_address,
      latitude,
      longitude,
      zone_id,
      lat,
      lng,
      evidences,
      ...rest
    } = data;

    const normalizedExpenses = (expenses || []).map((e: any) => ({
      type: e.type,
      description: e.description,
      cost: typeof e.cost === 'number' ? e.cost : parseFloat(String(e.cost).replace(',', '.')) || 0,
      quantity: typeof e.quantity === 'number'
        ? e.quantity
        : parseInt(String(e.quantity).replace(/\D/g, ''), 10) || 1,
    }));

    const computedTotal = normalizedExpenses.reduce(
      (sum: number, e: { cost: number; quantity: number }) =>
        sum + e.cost * e.quantity,
      0,
    );

    const finalTotal = target_amount ?? computedTotal;
    
    // Calcular votos mínimos automaticamente baseado no valor (ignora min_votes se fornecido)
    const calculatedMinVotes = calculateMinVotes(finalTotal);

    const finalLat = latitude ?? lat;
    const finalLng = longitude ?? lng;

    const imageUrls = [
      rest.image_url,
      ...(evidences || []),
    ].filter((u: string) => u && (u.startsWith('http') || u.startsWith('data:')));
    const mod = await this.moderationService.moderateTextAndImages(
      [rest.title, rest.description, short_description].filter(Boolean).join('\n\n'),
      imageUrls,
    );
    if (mod.flagged) {
      throw new BadRequestException(
        'Conteúdo não permitido. Revise o texto e as imagens antes de publicar.',
      );
    }

    const created = await this.prisma.project.create({
      data: {
        title: rest.title,
        shortDescription: short_description ?? null,
        description: rest.description ?? null,
        category: rest.category ?? null,
        status: rest.status ?? 'proposed',
        imageUrl: rest.image_url ?? null,
        evidences: evidences ?? [],
        targetAmount: finalTotal,
        currentAmount: current_amount ?? 0,
        minVotes: calculatedMinVotes, // Usa cálculo automático (ignora min_votes do frontend)
        votesCount: votes_count ?? 0,
        fundingDeadline: funding_deadline ? new Date(funding_deadline) : null,
        ownerId: owner_id || user.userId,
        ownerEmail: owner_email || user.email,
        locationAddress: location_address ?? null,
        latitude: finalLat ? parseFloat(String(finalLat)) : null,
        longitude: finalLng ? parseFloat(String(finalLng)) : null,
        zoneId: zone_id ?? null,
        expensesTotal: expenses_total ?? computedTotal,
        expenses: {
          create: normalizedExpenses,
        },
      },
      include: {
        expenses: true,
      },
    });

    return this.findOne(created.id);
  }

  async update(id: string, data: any) {
    const exists = await this.prisma.project.findUnique({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Projeto não encontrado');
    }

    const {
      expenses,
      target_amount,
      current_amount,
      min_votes, // Ignorado - sempre calculado automaticamente
      votes_count,
      funding_deadline,
      short_description,
      location_address,
      latitude,
      longitude,
      zone_id,
      lat,
      lng,
      owner_id,
      owner_email,
      ...rest
    } = data;

    const updateData: any = {
      ...rest,
    };

    if (short_description !== undefined) {
      updateData.shortDescription = short_description;
    }
    if (target_amount !== undefined) {
      updateData.targetAmount = target_amount;
      // Recalcular votos mínimos quando o valor muda
      updateData.minVotes = calculateMinVotes(target_amount);
    }
    if (current_amount !== undefined) updateData.currentAmount = current_amount;
    // min_votes é sempre calculado automaticamente, nunca atualizado manualmente
    if (votes_count !== undefined) updateData.votesCount = votes_count;
    if (funding_deadline !== undefined) {
      updateData.fundingDeadline = funding_deadline
        ? new Date(funding_deadline)
        : null;
    }
    if (owner_id !== undefined) updateData.ownerId = owner_id;
    if (owner_email !== undefined) updateData.ownerEmail = owner_email;
    if (location_address !== undefined) updateData.locationAddress = location_address;
    if (latitude !== undefined) updateData.latitude = latitude ? parseFloat(String(latitude)) : null;
    if (longitude !== undefined) updateData.longitude = longitude ? parseFloat(String(longitude)) : null;
    if (lat !== undefined) updateData.latitude = lat ? parseFloat(String(lat)) : null;
    if (lng !== undefined) updateData.longitude = lng ? parseFloat(String(lng)) : null;
    if (zone_id !== undefined) updateData.zoneId = zone_id;

    await this.prisma.project.update({
      where: { id },
      data: updateData,
    });

    // despesas podem ser atualizadas em rotas específicas no futuro

    return this.findOne(id);
  }

  async delete(id: string) {
    await this.prisma.project.delete({ where: { id } });
    return { success: true };
  }
}


