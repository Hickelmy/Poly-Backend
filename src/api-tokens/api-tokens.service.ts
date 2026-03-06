import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany() {
    const tokens = await this.prisma.apiToken.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    return tokens.map((t) => ({
      id: t.id,
      name: t.name,
      provider: t.provider,
      // Mascara o token para segurança (mostra apenas últimos 4 caracteres)
      token_masked: t.token ? `${'*'.repeat(Math.max(0, t.token.length - 4))}${t.token.slice(-4)}` : '',
      description: t.description,
      active: t.active,
      sort_order: t.sortOrder,
      created_date: t.createdAt,
      updated_date: t.updatedAt,
    }));
  }

  async findOne(id: string) {
    const token = await this.prisma.apiToken.findUnique({ where: { id } });
    if (!token) {
      throw new NotFoundException('Token não encontrado');
    }

    return {
      id: token.id,
      name: token.name,
      provider: token.provider,
      token_masked: token.token ? `${'*'.repeat(Math.max(0, token.token.length - 4))}${token.token.slice(-4)}` : '',
      description: token.description,
      active: token.active,
      sort_order: token.sortOrder,
      created_date: token.createdAt,
      updated_date: token.updatedAt,
    };
  }

  // Retorna o token completo (para uso interno)
  async getFullToken(provider: string) {
    const token = await this.prisma.apiToken.findFirst({
      where: { provider, active: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (!token) {
      return null;
    }

    return token.token;
  }

  // Retorna o primeiro token ativo (para uso em pagamentos)
  async getActivePaymentToken() {
    const token = await this.prisma.apiToken.findFirst({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (!token) {
      return null;
    }

    return {
      provider: token.provider,
      token: token.token,
    };
  }

  // Retorna a chave pública do Stripe (publishable key)
  // Para Stripe, a chave pública começa com 'pk_' e a secreta com 'sk_'
  async getStripePublishableKey() {
    const token = await this.prisma.apiToken.findFirst({
      where: { 
        provider: 'stripe',
        active: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    if (!token || !token.token) {
      return null;
    }

    // Se o token começa com 'sk_', precisa da chave pública correspondente
    // Por enquanto, retornamos null e vamos usar uma abordagem diferente
    // A chave pública deve ser armazenada separadamente ou derivada
    // Por segurança, vamos retornar null e o frontend vai usar uma variável de ambiente
    // OU podemos adicionar um campo 'publishable_key' no modelo ApiToken
    return null;
  }

  async create(data: any) {
    if (!data.name || !data.provider || !data.token) {
      throw new BadRequestException('Nome, provedor e token são obrigatórios');
    }

    // Obtém o maior sortOrder para colocar o novo no final
    const maxOrder = await this.prisma.apiToken.aggregate({
      _max: { sortOrder: true },
    });

    const created = await this.prisma.apiToken.create({
      data: {
        name: data.name,
        provider: data.provider,
        token: data.token,
        description: data.description ?? null,
        active: data.active ?? true,
        sortOrder: data.sort_order ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });

    return {
      id: created.id,
      name: created.name,
      provider: created.provider,
      token_masked: created.token ? `${'*'.repeat(Math.max(0, created.token.length - 4))}${created.token.slice(-4)}` : '',
      description: created.description,
      active: created.active,
      sort_order: created.sortOrder,
      created_date: created.createdAt,
      updated_date: created.updatedAt,
    };
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.apiToken.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Token não encontrado');
    }

    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.token !== undefined) updateData.token = data.token;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.sort_order !== undefined) updateData.sortOrder = data.sort_order;

    const updated = await this.prisma.apiToken.update({
      where: { id },
      data: updateData,
    });

    return {
      id: updated.id,
      name: updated.name,
      provider: updated.provider,
      token_masked: updated.token ? `${'*'.repeat(Math.max(0, updated.token.length - 4))}${updated.token.slice(-4)}` : '',
      description: updated.description,
      active: updated.active,
      sort_order: updated.sortOrder,
      created_date: updated.createdAt,
      updated_date: updated.updatedAt,
    };
  }

  async delete(id: string) {
    const existing = await this.prisma.apiToken.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Token não encontrado');
    }

    await this.prisma.apiToken.delete({ where: { id } });
    return { success: true, message: 'Token excluído com sucesso' };
  }

  // Reordena os tokens
  async reorder(tokenIds: string[]) {
    const updates = tokenIds.map((id, index) =>
      this.prisma.apiToken.update({
        where: { id },
        data: { sortOrder: index },
      }),
    );

    await this.prisma.$transaction(updates);
    return { success: true, message: 'Ordem atualizada com sucesso' };
  }
}

