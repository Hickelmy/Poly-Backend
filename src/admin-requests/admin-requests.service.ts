import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    email: string;
    name: string;
    phone?: string;
    location?: string;
    objective?: string;
  }) {
    if (!data.email || !data.name) {
      throw new BadRequestException('Email e nome são obrigatórios');
    }

    // Verifica se ja existe solicitacao pendente com esse email
    const existing = await this.prisma.adminRequest.findFirst({
      where: { email: data.email, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException('Já existe uma solicitação pendente para este email');
    }

    const request = await this.prisma.adminRequest.create({
      data: {
        email: data.email,
        name: data.name,
        phone: data.phone,
        location: data.location,
        objective: data.objective,
      },
    });

    return this.transform(request);
  }

  async findAll(status?: string) {
    const where: any = {};
    if (status) where.status = status;

    const requests = await this.prisma.adminRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => this.transform(r));
  }

  async approve(id: string, reviewerEmail: string) {
    const request = await this.prisma.adminRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitação não encontrada');
    if (request.status !== 'pending') {
      throw new BadRequestException('Esta solicitação já foi processada');
    }

    // Atualiza a solicitacao
    const updated = await this.prisma.adminRequest.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedBy: reviewerEmail,
        reviewedAt: new Date(),
      },
    });

    // Se o usuario ja existe, atualiza o accountType para ZONE_ADMIN
    const existingUser = await this.prisma.user.findUnique({
      where: { email: request.email },
    });

    if (existingUser) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { accountType: 'ZONE_ADMIN' },
      });
    }

    return this.transform(updated);
  }

  async reject(id: string, reviewerEmail: string, reason?: string) {
    const request = await this.prisma.adminRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitação não encontrada');
    if (request.status !== 'pending') {
      throw new BadRequestException('Esta solicitação já foi processada');
    }

    const updated = await this.prisma.adminRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy: reviewerEmail,
        reviewedAt: new Date(),
        rejectReason: reason,
      },
    });

    return this.transform(updated);
  }

  private transform(r: any) {
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      phone: r.phone,
      location: r.location,
      objective: r.objective,
      status: r.status,
      reviewed_by: r.reviewedBy,
      reviewed_at: r.reviewedAt,
      reject_reason: r.rejectReason,
      created_at: r.createdAt,
    };
  }
}
