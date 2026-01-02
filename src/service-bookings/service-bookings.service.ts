import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ServiceBookingFilter {
  [key: string]: any;
}

@Injectable()
export class ServiceBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Gerar código único de 6 dígitos
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private buildWhere(filters: ServiceBookingFilter) {
    const where: ServiceBookingFilter = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      let parsed: any = value;
      if (value === 'true' || value === true) parsed = true;
      else if (value === 'false' || value === false) parsed = false;
      else if (!isNaN(Number(value)) && key !== 'provider_email' && key !== 'client_email') {
        parsed = Number(value);
      }
      let prismaKey = key;
      if (key === 'provider_email') prismaKey = 'providerEmail';
      if (key === 'client_email') prismaKey = 'clientEmail';
      if (key === 'service_id') prismaKey = 'serviceId';
      if (key === 'provider_id') prismaKey = 'providerId';
      if (key === 'client_id') prismaKey = 'clientId';
      where[prismaKey] = parsed;
    });
    return where;
  }

  async findMany(params: { sort?: string; limit?: number; filters?: ServiceBookingFilter }) {
    const { sort, limit, filters = {} } = params;

    let orderBy: any = { createdAt: 'desc' };
    if (sort) {
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      let prismaField = field;
      if (field === 'created_date' || field === 'recent') prismaField = 'createdAt';
      if (field === 'scheduled_at') prismaField = 'scheduledAt';
      orderBy = { [prismaField]: desc ? 'desc' : 'asc' };
    }

    const where = this.buildWhere(filters);

    const items = await this.prisma.serviceBooking.findMany({
      where,
      orderBy,
      take: limit && Number.isFinite(limit) ? limit : undefined,
    });

    return items.map((b) => ({
      ...b,
      created_date: b.createdAt,
      service_id: b.serviceId,
      client_id: b.clientId,
      provider_id: b.providerId,
      service_title: b.serviceTitle,
      client_email: b.clientEmail,
      provider_email: b.providerEmail,
      scheduled_at: b.scheduledAt,
      duration_hours: b.durationHours,
      client_price_type: b.clientPriceType,
      total_amount: b.totalAmount,
      commission_amount: b.commissionAmount,
      payment_status: b.paymentStatus,
      service_code: b.serviceCode,
      code_verified: b.codeVerified,
    }));
  }

  async findOne(id: string) {
    const booking = await this.prisma.serviceBooking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    return {
      ...booking,
      created_date: booking.createdAt,
      service_id: booking.serviceId,
      client_id: booking.clientId,
      provider_id: booking.providerId,
      service_title: booking.serviceTitle,
      client_email: booking.clientEmail,
      provider_email: booking.providerEmail,
      scheduled_at: booking.scheduledAt,
      duration_hours: booking.durationHours,
      client_price_type: booking.clientPriceType,
      total_amount: booking.totalAmount,
      commission_amount: booking.commissionAmount,
      payment_status: booking.paymentStatus,
      service_code: booking.serviceCode,
      code_verified: booking.codeVerified,
      started_at: booking.startedAt,
      client_lat: booking.clientLat,
      client_lng: booking.clientLng,
      provider_lat: booking.providerLat,
      provider_lng: booking.providerLng,
      final_amount: booking.finalAmount,
      actual_worked_hours: booking.actualWorkedHours,
      actual_worked_minutes: booking.actualWorkedMinutes,
    };
  }

  async create(data: any) {
    const created = await this.prisma.serviceBooking.create({
      data: {
        serviceId: data.service_id ?? data.serviceId ?? null,
        clientId: data.client_id ?? data.clientId ?? null,
        clientEmail: data.client_email ?? data.clientEmail ?? null,
        providerId: data.provider_id ?? data.providerId ?? null,
        providerEmail: data.provider_email ?? data.providerEmail ?? null,
        serviceTitle: data.service_title ?? data.serviceTitle ?? null,
        scheduledAt: data.scheduled_at ? new Date(data.scheduled_at) : new Date(),
        durationHours: data.duration_hours ?? data.durationHours ?? 1,
        notes: data.notes ?? null,
        clientPriceType: data.client_price_type ?? data.clientPriceType ?? null,
        totalAmount: data.total_amount ?? data.totalAmount ?? 0,
        commissionAmount: data.commission_amount ?? data.commissionAmount ?? 0,
        status: data.status ?? 'requested',
        paymentStatus: data.payment_status ?? data.paymentStatus ?? 'pending',
      },
    });

    return {
      ...created,
      created_date: created.createdAt,
      service_id: created.serviceId,
      client_id: created.clientId,
      provider_id: created.providerId,
      service_title: created.serviceTitle,
      client_email: created.clientEmail,
      provider_email: created.providerEmail,
      scheduled_at: created.scheduledAt,
      duration_hours: created.durationHours,
      client_price_type: created.clientPriceType,
      total_amount: created.totalAmount,
      commission_amount: created.commissionAmount,
      payment_status: created.paymentStatus,
      service_code: created.serviceCode,
      code_verified: created.codeVerified,
      started_at: created.startedAt,
      client_lat: created.clientLat,
      client_lng: created.clientLng,
      provider_lat: created.providerLat,
      provider_lng: created.providerLng,
      final_amount: created.finalAmount,
      actual_worked_hours: created.actualWorkedHours,
      actual_worked_minutes: created.actualWorkedMinutes,
    };
  }

  // Calcular valor final baseado no tempo trabalhado e preço por hora
  private calculateFinalAmount(
    pricePerHour: number,
    workedHours: number,
    workedMinutes: number
  ): number {
    // Converter minutos para fração de hora (ex: 22 minutos = 22/60 = 0.3667 horas)
    const totalHours = workedHours + (workedMinutes / 60);
    return pricePerHour * totalHours;
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.serviceBooking.findUnique({ 
      where: { id },
      include: { service: true }
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Se está aceitando o agendamento, gerar código único do serviço
    if (data.status === 'accepted' && existing.status === 'requested') {
      data.serviceCode = this.generateCode();
    }

    // Se está informando tempo trabalhado, calcular valor final
    let finalAmount = existing.finalAmount;
    if (data.actual_worked_hours !== undefined || data.actual_worked_minutes !== undefined) {
      const workedHours = data.actual_worked_hours ?? data.actualWorkedHours ?? existing.actualWorkedHours ?? 0;
      const workedMinutes = data.actual_worked_minutes ?? data.actualWorkedMinutes ?? existing.actualWorkedMinutes ?? 0;
      
      // Buscar o preço do serviço e calcular baseado no tipo escolhido pelo cliente
      if (existing.service) {
        const priceType = existing.clientPriceType;
        
        if (priceType === 'hora' && existing.service.pricePerHour) {
          finalAmount = this.calculateFinalAmount(existing.service.pricePerHour, workedHours, workedMinutes);
        } else if (priceType === 'diaria' && existing.service.pricePerDay) {
          // Para diária, calcular baseado em dias completos (8 horas = 1 dia)
          const totalHours = workedHours + (workedMinutes / 60);
          const days = Math.ceil(totalHours / 8);
          finalAmount = existing.service.pricePerDay * days;
        } else if (priceType === 'servico' && existing.service.pricePerService) {
          // Se for serviço completo, usar o preço fixo
          finalAmount = existing.service.pricePerService;
        }
      }
    }

    const updated = await this.prisma.serviceBooking.update({
      where: { id },
      data: {
        status: data.status ?? existing.status,
        paymentStatus: data.payment_status ?? data.paymentStatus ?? existing.paymentStatus,
        notes: data.notes ?? existing.notes,
        serviceCode: data.service_code ?? data.serviceCode ?? existing.serviceCode,
        codeVerified: data.code_verified ?? data.codeVerified ?? existing.codeVerified,
        startedAt: data.started_at ? new Date(data.started_at) : data.startedAt ?? existing.startedAt,
        clientLat: data.client_lat ?? data.clientLat ?? existing.clientLat,
        clientLng: data.client_lng ?? data.clientLng ?? existing.clientLng,
        providerLat: data.provider_lat ?? data.providerLat ?? existing.providerLat,
        providerLng: data.provider_lng ?? data.providerLng ?? existing.providerLng,
        actualWorkedHours: data.actual_worked_hours ?? data.actualWorkedHours ?? existing.actualWorkedHours,
        actualWorkedMinutes: data.actual_worked_minutes ?? data.actualWorkedMinutes ?? existing.actualWorkedMinutes,
        finalAmount: finalAmount,
      },
    });

    return {
      ...updated,
      created_date: updated.createdAt,
      service_id: updated.serviceId,
      client_id: updated.clientId,
      provider_id: updated.providerId,
      service_title: updated.serviceTitle,
      client_email: updated.clientEmail,
      provider_email: updated.providerEmail,
      scheduled_at: updated.scheduledAt,
      duration_hours: updated.durationHours,
      client_price_type: updated.clientPriceType,
      total_amount: updated.totalAmount,
      commission_amount: updated.commissionAmount,
      payment_status: updated.paymentStatus,
      service_code: updated.serviceCode,
      started_at: updated.startedAt,
      client_lat: updated.clientLat,
      client_lng: updated.clientLng,
      provider_lat: updated.providerLat,
      provider_lng: updated.providerLng,
      code_verified: updated.codeVerified,
      final_amount: updated.finalAmount,
      actual_worked_hours: updated.actualWorkedHours,
      actual_worked_minutes: updated.actualWorkedMinutes,
    };
  }

  // Verificar código do serviço para iniciar serviço
  async verifyCode(
    id: string, 
    serviceCode: string, 
    userEmail: string,
    clientLat?: number,
    clientLng?: number,
    providerLat?: number,
    providerLng?: number
  ) {
    const booking = await this.prisma.serviceBooking.findUnique({ where: { id } });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Verificar se o usuário é o prestador
    if (booking.providerEmail !== userEmail) {
      throw new BadRequestException('Apenas o prestador pode verificar o código');
    }

    // Verificar se o código está correto
    if (booking.serviceCode !== serviceCode) {
      throw new BadRequestException('Código inválido');
    }

    // Verificar se o serviço já foi iniciado
    if (booking.codeVerified) {
      throw new BadRequestException('Serviço já foi iniciado');
    }

    // Verificar se o status permite iniciar
    if (booking.status !== 'accepted') {
      throw new BadRequestException('O agendamento precisa estar aceito para iniciar');
    }

    // Atualizar status para in_progress, marcar código como verificado e registrar localização/hora
    const updated = await this.prisma.serviceBooking.update({
      where: { id },
      data: {
        status: 'in_progress',
        codeVerified: true,
        startedAt: new Date(), // Hora de início do serviço
        clientLat: clientLat ?? null,
        clientLng: clientLng ?? null,
        providerLat: providerLat ?? null,
        providerLng: providerLng ?? null,
      },
    });

    return {
      ...updated,
      created_date: updated.createdAt,
      service_id: updated.serviceId,
      client_id: updated.clientId,
      provider_id: updated.providerId,
      service_title: updated.serviceTitle,
      client_email: updated.clientEmail,
      provider_email: updated.providerEmail,
      scheduled_at: updated.scheduledAt,
      duration_hours: updated.durationHours,
      client_price_type: updated.clientPriceType,
      total_amount: updated.totalAmount,
      commission_amount: updated.commissionAmount,
      payment_status: updated.paymentStatus,
      service_code: updated.serviceCode,
      started_at: updated.startedAt,
      client_lat: updated.clientLat,
      client_lng: updated.clientLng,
      provider_lat: updated.providerLat,
      provider_lng: updated.providerLng,
      code_verified: updated.codeVerified,
      final_amount: updated.finalAmount,
      actual_worked_hours: updated.actualWorkedHours,
      actual_worked_minutes: updated.actualWorkedMinutes,
    };
  }

  async delete(id: string) {
    await this.prisma.serviceBooking.delete({ where: { id } });
    return { success: true };
  }
}

