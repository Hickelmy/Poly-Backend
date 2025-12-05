import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ProjectFilter {
  [key: string]: any;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findMany(params: { sort?: string; limit?: number; filters?: ProjectFilter }) {
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

  async findOne(id: string) {
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

    const created = await this.prisma.project.create({
      data: {
        title: rest.title,
        shortDescription: short_description ?? null,
        description: rest.description ?? null,
        category: rest.category ?? null,
        status: rest.status ?? 'proposed',
        imageUrl: rest.image_url ?? null,
        evidences: evidences ?? [],
        targetAmount: target_amount ?? 0,
        currentAmount: current_amount ?? 0,
        minVotes: min_votes ?? 10,
        votesCount: votes_count ?? 0,
        fundingDeadline: funding_deadline ? new Date(funding_deadline) : null,
        ownerId: owner_id || user.userId,
        ownerEmail: owner_email || user.email,
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
      min_votes,
      votes_count,
      funding_deadline,
      short_description,
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
    if (target_amount !== undefined) updateData.targetAmount = target_amount;
    if (current_amount !== undefined) updateData.currentAmount = current_amount;
    if (min_votes !== undefined) updateData.minVotes = min_votes;
    if (votes_count !== undefined) updateData.votesCount = votes_count;
    if (funding_deadline !== undefined) {
      updateData.fundingDeadline = funding_deadline
        ? new Date(funding_deadline)
        : null;
    }
    if (owner_id !== undefined) updateData.ownerId = owner_id;
    if (owner_email !== undefined) updateData.ownerEmail = owner_email;

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


