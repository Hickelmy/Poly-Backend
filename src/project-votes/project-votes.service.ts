import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ProjectVoteFilter {
  [key: string]: any;
}

@Injectable()
export class ProjectVotesService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filters: ProjectVoteFilter) {
    const where: any = {};

    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;

      let prismaKey = key;
      if (key === 'project_id') prismaKey = 'projectId';
      if (key === 'user_id') prismaKey = 'userId';
      if (key === 'user_email') prismaKey = 'userEmail';

      where[prismaKey] = value;
    });

    return where;
  }

  async findMany(params: { sort?: string; limit?: number; filters?: ProjectVoteFilter }) {
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

    const items = await this.prisma.projectVote.findMany({
      where,
      orderBy,
      take: limit && Number.isFinite(limit) ? limit : undefined,
    });

    return items.map((v) => ({
      ...v,
      project_id: v.projectId,
      user_id: v.userId,
      user_email: v.userEmail,
      created_date: v.createdAt,
    }));
  }

  async create(data: any) {
    // Garante 1 voto por usuário por projeto
    const already = await this.prisma.projectVote.findFirst({
      where: {
        projectId: data.project_id,
        userEmail: data.user_email ?? null,
      },
    });

    if (already) {
      throw new BadRequestException('Você já votou neste projeto.');
    }

    const created = await this.prisma.projectVote.create({
      data: {
        projectId: data.project_id,
        userId: data.user_id ?? null,
        userEmail: data.user_email ?? null,
        type: data.type === 'down' ? 'down' : 'up',
      },
    });

    // Após criar o voto, recalcula os totais e atualiza status do projeto, se necessário
    const project = await this.prisma.project.findUnique({
      where: { id: data.project_id },
      include: { votes: true },
    });

    if (project) {
      const upVotes =
        project.votes?.filter((v) => v.type === 'up').length ?? 0;
      const downVotes =
        project.votes?.filter((v) => v.type === 'down').length ?? 0;
      const diff = upVotes - downVotes;
      const minVotes = project.minVotes ?? 0;

      if (
        (project.status === 'proposed' || project.status === 'voting') &&
        diff >= minVotes
      ) {
        await this.prisma.project.update({
          where: { id: project.id },
          data: { status: 'funding' },
        });
      } else if (project.status === 'proposed') {
        // se já começou a receber votos, garante que fique em "voting"
        await this.prisma.project.update({
          where: { id: project.id },
          data: { status: 'voting' },
        });
      }
    }

    return {
      ...created,
      project_id: created.projectId,
      user_id: created.userId,
      user_email: created.userEmail,
      type: created.type,
      created_date: created.createdAt,
    };
  }

  async deleteForUser(data: { project_id: string; user_email: string }) {
    const existing = await this.prisma.projectVote.findFirst({
      where: {
        projectId: data.project_id,
        userEmail: data.user_email,
      },
    });

    if (!existing) {
      return { success: true };
    }

    await this.prisma.projectVote.delete({ where: { id: existing.id } });

    const project = await this.prisma.project.findUnique({
      where: { id: data.project_id },
      include: { votes: true },
    });

    if (project) {
      const upVotes =
        project.votes?.filter((v) => v.type === 'up').length ?? 0;
      const downVotes =
        project.votes?.filter((v) => v.type === 'down').length ?? 0;
      const diff = upVotes - downVotes;
      const minVotes = project.minVotes ?? 0;

      let newStatus = project.status;
      if (diff >= minVotes && minVotes > 0) {
        newStatus = 'funding';
      } else if (diff > 0) {
        newStatus = 'voting';
      } else {
        newStatus = 'proposed';
      }

      if (newStatus !== project.status) {
        await this.prisma.project.update({
          where: { id: project.id },
          data: { status: newStatus },
        });
      }
    }

    return { success: true };
  }
}


