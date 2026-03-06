import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZonesService } from '../zones/zones.service';
import { ModerationService } from '../moderation/moderation.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class NewsService {
  constructor(
    private prisma: PrismaService,
    private zonesService: ZonesService,
    private moderationService: ModerationService,
  ) {}

  async create(createNewsDto: CreateNewsDto, authorId: string, userRole?: string) {
    const zoneId = createNewsDto.zoneId || null;
    if (zoneId) {
      const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
      const accessibleZoneIds = await this.zonesService.getAccessibleZoneIds(authorId, { isAdmin });
      if (accessibleZoneIds === null || !accessibleZoneIds.includes(zoneId)) {
        throw new ForbiddenException('Você não tem acesso a esta zona');
      }
    }

    const imageUrls = [
      createNewsDto.imageUrl,
      ...(createNewsDto.images || []),
    ].filter((u): u is string => !!u && (u.startsWith('http') || u.startsWith('data:')));
    const mod = await this.moderationService.moderateTextAndImages(
      [createNewsDto.title, createNewsDto.content, createNewsDto.summary].filter(Boolean).join('\n\n'),
      imageUrls,
    );
    if (mod.flagged) {
      throw new BadRequestException(
        'Conteúdo não permitido. Revise o texto e as imagens antes de publicar.',
      );
    }

    return (this.prisma as any).news.create({
      data: {
        ...createNewsDto,
        authorId,
        publishedAt: createNewsDto.isPublished !== false ? new Date() : null,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findAll(options?: {
    zoneId?: string;
    publishedOnly?: boolean;
    limit?: number;
    offset?: number;
    userId?: string;
    userRole?: string;
  }) {
    const { zoneId, publishedOnly = true, limit = 20, offset = 0, userId, userRole } = options || {};
    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';

    const accessibleZoneIds = await this.zonesService.getAccessibleZoneIds(userId, { isAdmin });
    const requestedZoneId = zoneId;
    const validZoneId =
      accessibleZoneIds !== null &&
      requestedZoneId &&
      (requestedZoneId === 'null' || accessibleZoneIds.includes(requestedZoneId))
        ? requestedZoneId
        : null;

    const where: any = {};
    if (validZoneId === 'null') where.zoneId = null;
    else if (validZoneId) where.zoneId = validZoneId;
    else if (accessibleZoneIds === null) {
      /* gestores: sem filtro de zona */
    } else if (accessibleZoneIds.length === 0) where.zoneId = null;
    else where.OR = [{ zoneId: null }, { zoneId: { in: accessibleZoneIds } }];
    if (publishedOnly) where.isPublished = true;

    const news = await (this.prisma as any).news.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
        likes: userId ? {
          where: { userId },
          select: { id: true },
        } : false,
      },
      orderBy: [
        { isPinned: 'desc' },
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: offset,
    });

    return news.map((item: any) => ({
      ...item,
      zoneName: item.zone?.name,
      isLikedByMe: userId ? item.likes?.length > 0 : undefined,
      likes: undefined,
    }));
  }

  async findOne(id: string, userId?: string, userRole?: string) {
    const news = await (this.prisma as any).news.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
        likes: userId ? {
          where: { userId },
          select: { id: true },
        } : false,
      },
    });

    if (!news) {
      throw new NotFoundException('Notícia não encontrada');
    }

    // Zona exclusiva: gestores veem tudo; outros só se for global ou zona vinculada ao perfil
    if (news.zoneId) {
      const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
      const accessibleZoneIds = await this.zonesService.getAccessibleZoneIds(userId, { isAdmin });
      if (accessibleZoneIds !== null && !accessibleZoneIds.includes(news.zoneId)) {
        throw new NotFoundException('Notícia não encontrada');
      }
    }

    return {
      ...news,
      zoneName: news.zone?.name,
      isLikedByMe: userId ? news.likes?.length > 0 : undefined,
      likes: undefined,
    };
  }

  async update(id: string, updateNewsDto: UpdateNewsDto, userId: string) {
    const news = await (this.prisma as any).news.findUnique({ where: { id } });
    
    if (!news) {
      throw new NotFoundException('Notícia não encontrada');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (news.authorId !== userId && user?.role !== 'ADMIN') {
      throw new ForbiddenException('Você não tem permissão para editar esta notícia');
    }

    const finalTitle = updateNewsDto.title ?? news.title;
    const finalContent = updateNewsDto.content ?? news.content;
    const finalSummary = updateNewsDto.summary ?? news.summary;
    const finalImageUrl = updateNewsDto.imageUrl ?? news.imageUrl;
    const finalImages = updateNewsDto.images ?? news.images ?? [];
    const textToModerate = [finalTitle, finalContent, finalSummary].filter(Boolean).join('\n\n');
    const imageUrls = [finalImageUrl, ...finalImages].filter((u): u is string => !!u && (u.startsWith('http') || u.startsWith('data:')));
    if (textToModerate || imageUrls.length > 0) {
      const mod = await this.moderationService.moderateTextAndImages(textToModerate, imageUrls);
      if (mod.flagged) {
        throw new BadRequestException(
          'Conteúdo não permitido. Revise o texto e as imagens antes de publicar.',
        );
      }
    }

    const publishedAt = updateNewsDto.isPublished === true && !news.publishedAt
      ? new Date()
      : news.publishedAt;

    return (this.prisma as any).news.update({
      where: { id },
      data: {
        ...updateNewsDto,
        publishedAt,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    const news = await (this.prisma as any).news.findUnique({ where: { id } });
    
    if (!news) {
      throw new NotFoundException('Notícia não encontrada');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (news.authorId !== userId && user?.role !== 'ADMIN') {
      throw new ForbiddenException('Você não tem permissão para excluir esta notícia');
    }

    return (this.prisma as any).news.delete({ where: { id } });
  }

  // ========== LIKES ==========

  async like(newsId: string, userId: string) {
    const news = await (this.prisma as any).news.findUnique({ where: { id: newsId } });
    if (!news) {
      throw new NotFoundException('Notícia não encontrada');
    }

    const existingLike = await (this.prisma as any).newsLike.findUnique({
      where: { newsId_userId: { newsId, userId } },
    });

    if (existingLike) {
      return { message: 'Você já curtiu esta notícia' };
    }

    await this.prisma.$transaction([
      (this.prisma as any).newsLike.create({
        data: { newsId, userId },
      }),
      (this.prisma as any).news.update({
        where: { id: newsId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);

    return { message: 'Curtida adicionada' };
  }

  async unlike(newsId: string, userId: string) {
    const existingLike = await (this.prisma as any).newsLike.findUnique({
      where: { newsId_userId: { newsId, userId } },
    });

    if (!existingLike) {
      return { message: 'Você não curtiu esta notícia' };
    }

    await this.prisma.$transaction([
      (this.prisma as any).newsLike.delete({
        where: { newsId_userId: { newsId, userId } },
      }),
      (this.prisma as any).news.update({
        where: { id: newsId },
        data: { likesCount: { decrement: 1 } },
      }),
    ]);

    return { message: 'Curtida removida' };
  }

  // ========== COMMENTS ==========

  async getComments(newsId: string) {
    const news = await (this.prisma as any).news.findUnique({ where: { id: newsId } });
    if (!news) {
      throw new NotFoundException('Notícia não encontrada');
    }

    return (this.prisma as any).newsComment.findMany({
      where: { newsId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addComment(newsId: string, userId: string, dto: CreateCommentDto) {
    const news = await (this.prisma as any).news.findUnique({ where: { id: newsId } });
    if (!news) {
      throw new NotFoundException('Notícia não encontrada');
    }

    const mod = await this.moderationService.moderateText(dto.content);
    if (mod.flagged) {
      throw new BadRequestException(
        'Comentário não permitido. Revise o texto antes de enviar.',
      );
    }

    const [comment] = await this.prisma.$transaction([
      (this.prisma as any).newsComment.create({
        data: {
          newsId,
          userId,
          content: dto.content,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
      (this.prisma as any).news.update({
        where: { id: newsId },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);

    return comment;
  }

  async removeComment(newsId: string, commentId: string, userId: string) {
    const comment = await (this.prisma as any).newsComment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.newsId !== newsId) {
      throw new NotFoundException('Comentário não encontrado');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (comment.userId !== userId && user?.role !== 'ADMIN') {
      throw new ForbiddenException('Você não tem permissão para excluir este comentário');
    }

    await this.prisma.$transaction([
      (this.prisma as any).newsComment.delete({ where: { id: commentId } }),
      (this.prisma as any).news.update({
        where: { id: newsId },
        data: { commentsCount: { decrement: 1 } },
      }),
    ]);

    return { message: 'Comentário removido' };
  }

  // ========== REPORTS ==========

  async report(newsId: string, userId: string, dto: CreateReportDto) {
    const news = await (this.prisma as any).news.findUnique({ where: { id: newsId } });
    if (!news) {
      throw new NotFoundException('Notícia não encontrada');
    }

    await this.prisma.$transaction([
      (this.prisma as any).newsReport.create({
        data: {
          newsId,
          userId,
          reason: dto.reason,
          description: dto.description,
        },
      }),
      (this.prisma as any).news.update({
        where: { id: newsId },
        data: { reportsCount: { increment: 1 } },
      }),
    ]);

    return { message: 'Denúncia enviada com sucesso' };
  }

  async getReports(options?: { newsId?: string; status?: string }) {
    const where: any = {};
    if (options?.newsId) where.newsId = options.newsId;
    if (options?.status) where.status = options.status;

    return (this.prisma as any).newsReport.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        news: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateReportStatus(reportId: string, status: string) {
    return (this.prisma as any).newsReport.update({
      where: { id: reportId },
      data: { status },
    });
  }
}
