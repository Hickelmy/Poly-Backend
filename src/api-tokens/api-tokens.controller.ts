import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTokensService } from './api-tokens.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser extends Request {
  user?: { userId: string; email: string; role: string };
}

function requireAdmin(role?: string) {
  if (role !== 'ADMIN') {
    throw new ForbiddenException('Apenas administradores podem gerenciar tokens de API');
  }
}

@Controller('api-tokens')
@UseGuards(JwtAuthGuard)
export class ApiTokensController {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  @Get()
  async findMany(@Req() req: RequestWithUser) {
    requireAdmin(req.user?.role);
    return this.apiTokensService.findMany();
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    requireAdmin(req.user?.role);
    return this.apiTokensService.findOne(id);
  }

  @Post()
  async create(@Body() data: any, @Req() req: RequestWithUser) {
    requireAdmin(req.user?.role);
    return this.apiTokensService.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any, @Req() req: RequestWithUser) {
    requireAdmin(req.user?.role);
    return this.apiTokensService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: RequestWithUser) {
    requireAdmin(req.user?.role);
    return this.apiTokensService.delete(id);
  }

  @Post('reorder')
  async reorder(@Body() data: { token_ids: string[] }, @Req() req: RequestWithUser) {
    requireAdmin(req.user?.role);
    return this.apiTokensService.reorder(data.token_ids);
  }
}

