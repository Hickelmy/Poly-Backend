import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MIN_PAYMENT_AMOUNT = 20;

export interface ProjectPaymentFilter {
  [key: string]: any;
}

@Injectable()
export class ProjectPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filters: ProjectPaymentFilter) {
    const where: any = {};

    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;

      let prismaKey = key;
      if (key === 'project_id') prismaKey = 'projectId';
      if (key === 'user_id') prismaKey = 'userId';
      if (key === 'user_email') prismaKey = 'userEmail';
      if (key === 'status') prismaKey = 'status';

      where[prismaKey] = value;
    });

    return where;
  }

  async findMany(params: { sort?: string; limit?: number; filters?: ProjectPaymentFilter }) {
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

    const items = await this.prisma.projectPayment.findMany({
      where,
      orderBy,
      take: limit && Number.isFinite(limit) ? limit : undefined,
    });

    return items.map((p) => ({
      ...p,
      project_id: p.projectId,
      user_id: p.userId,
      user_email: p.userEmail,
      commission_amount: p.commissionAmount,
      payment_method: p.paymentMethod,
      is_subscription: p.isSubscription,
      transaction_id: p.transactionId,
      created_date: p.createdAt,
      updated_date: p.updatedAt,
    }));
  }

  async create(data: any) {
    const amount = parseFloat(data.amount);
    
    if (!amount || amount <= 0) {
      throw new BadRequestException('Valor inválido');
    }

    if (amount < MIN_PAYMENT_AMOUNT) {
      throw new BadRequestException(`O valor mínimo para pagamento é R$ ${MIN_PAYMENT_AMOUNT.toFixed(2)}`);
    }

    const created = await this.prisma.projectPayment.create({
      data: {
        projectId: data.project_id,
        userId: data.user_id ?? null,
        userEmail: data.user_email ?? null,
        amount: amount,
        commissionAmount: data.commission_amount ?? 0,
        paymentMethod: data.payment_method,
        status: data.status ?? 'pending',
        isSubscription: data.is_subscription ?? false,
        anonymous: data.anonymous ?? false,
        transactionId: data.transaction_id ?? null,
      },
    });

    return {
      ...created,
      project_id: created.projectId,
      user_id: created.userId,
      user_email: created.userEmail,
      commission_amount: created.commissionAmount,
      payment_method: created.paymentMethod,
      is_subscription: created.isSubscription,
      transaction_id: created.transactionId,
      created_date: created.createdAt,
      updated_date: created.updatedAt,
    };
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.projectPayment.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    const updateData: any = {};

    if (data.amount !== undefined) {
      const amount = parseFloat(data.amount);
      if (!amount || amount <= 0) {
        throw new BadRequestException('Valor inválido');
      }
      if (amount < MIN_PAYMENT_AMOUNT) {
        throw new BadRequestException(`O valor mínimo para pagamento é R$ ${MIN_PAYMENT_AMOUNT.toFixed(2)}`);
      }
      updateData.amount = amount;
    }
    if (data.commission_amount !== undefined)
      updateData.commissionAmount = data.commission_amount;
    if (data.payment_method !== undefined)
      updateData.paymentMethod = data.payment_method;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.is_subscription !== undefined)
      updateData.isSubscription = data.is_subscription;
    if (data.anonymous !== undefined) updateData.anonymous = data.anonymous;
    if (data.transaction_id !== undefined)
      updateData.transactionId = data.transaction_id;

    const updated = await this.prisma.projectPayment.update({
      where: { id },
      data: updateData,
    });

    return {
      ...updated,
      project_id: updated.projectId,
      user_id: updated.userId,
      user_email: updated.userEmail,
      commission_amount: updated.commissionAmount,
      payment_method: updated.paymentMethod,
      is_subscription: updated.isSubscription,
      transaction_id: updated.transactionId,
      created_date: updated.createdAt,
      updated_date: updated.updatedAt,
    };
  }
}


