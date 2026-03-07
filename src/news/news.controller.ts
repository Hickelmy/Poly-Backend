import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  // ========== CRUD DE NOTÍCIAS ==========

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createNewsDto: CreateNewsDto, @Request() req: any) {
    return this.newsService.create(
      createNewsDto,
      req.user.userId ?? req.user.sub,
      req.user.role,
    );
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Query('zoneId') zoneId?: string,
    @Query('publishedOnly') publishedOnly?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Request() req?: any,
  ) {
    return this.newsService.findAll({
      zoneId,
      publishedOnly: publishedOnly !== 'false',
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      userId: req?.user?.userId ?? req?.user?.sub,
      userRole: req?.user?.role,
    });
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id') id: string, @Request() req?: any) {
    return this.newsService.findOne(id, req?.user?.userId ?? req?.user?.sub, req?.user?.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateNewsDto: UpdateNewsDto,
    @Request() req: any,
  ) {
    return this.newsService.update(id, updateNewsDto, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.newsService.remove(id, req.user.userId);
  }

  // ========== LIKES ==========

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  like(@Param('id') id: string, @Request() req: any) {
    return this.newsService.like(id, req.user.userId);
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  unlike(@Param('id') id: string, @Request() req: any) {
    return this.newsService.unlike(id, req.user.userId);
  }

  // ========== COMMENTS ==========

  @Get(':id/comments')
  getComments(@Param('id') id: string) {
    return this.newsService.getComments(id);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @Request() req: any,
  ) {
    return this.newsService.addComment(id, req.user.userId, dto);
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  removeComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Request() req: any,
  ) {
    return this.newsService.removeComment(id, commentId, req.user.userId);
  }

  // ========== REPORTS ==========

  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  report(
    @Param('id') id: string,
    @Body() dto: CreateReportDto,
    @Request() req: any,
  ) {
    return this.newsService.report(id, req.user.userId, dto);
  }

  @Get('reports')
  @UseGuards(JwtAuthGuard)
  getReports(
    @Query('newsId') newsId?: string,
    @Query('status') status?: string,
    @Request() req?: any,
  ) {
    if (req?.user?.role !== 'ADMIN' && req?.user?.role !== 'MANAGER') {
      throw new ForbiddenException('Apenas administradores podem ver relatórios');
    }
    return this.newsService.getReports({ newsId, status });
  }

  @Patch('reports/:reportId')
  @UseGuards(JwtAuthGuard)
  updateReportStatus(
    @Param('reportId') reportId: string,
    @Body('status') status: string,
    @Request() req: any,
  ) {
    if (req?.user?.role !== 'ADMIN' && req?.user?.role !== 'MANAGER') {
      throw new ForbiddenException('Apenas administradores podem gerenciar relatórios');
    }
    return this.newsService.updateReportStatus(reportId, status);
  }
}
