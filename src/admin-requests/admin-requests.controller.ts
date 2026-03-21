import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { AdminRequestsService } from './admin-requests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function requireManager(role?: string) {
  if (role !== 'MANAGER' && role !== 'ADMIN') {
    throw new ForbiddenException('Apenas gestores podem gerenciar solicitações');
  }
}

@Controller('admin-requests')
export class AdminRequestsController {
  constructor(private readonly adminRequestsService: AdminRequestsService) {}

  // Submeter solicitacao (publico)
  @Post()
  async create(
    @Body() body: {
      email: string;
      name: string;
      phone?: string;
      location?: string;
      objective?: string;
    },
  ) {
    return this.adminRequestsService.create(body);
  }

  // Listar solicitacoes (gestores)
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Request() req: any, @Query('status') status?: string) {
    requireManager(req.user?.role);
    return this.adminRequestsService.findAll(status);
  }

  // Aprovar solicitacao
  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard)
  async approve(@Request() req: any, @Param('id') id: string) {
    requireManager(req.user?.role);
    return this.adminRequestsService.approve(id, req.user.email);
  }

  // Rejeitar solicitacao
  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard)
  async reject(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    requireManager(req.user?.role);
    return this.adminRequestsService.reject(id, req.user.email, body.reason);
  }
}
