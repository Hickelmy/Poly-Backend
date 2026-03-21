import {
  Body, Controller, Get, Param, Post, Query, Req, ForbiddenException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EventsService } from './events.service';
import { BatchEventsDto } from './dto/batch-events.dto';

interface ReqUser extends Request {
  user?: { userId: string; email: string; role: string };
}

const MANAGER_ROLES = ['MANAGER', 'gestor'];

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /** Batch-insert behavioural events for the authenticated user. */
  @SkipThrottle()
  @Post('batch')
  batch(@Body() dto: BatchEventsDto, @Req() req: ReqUser) {
    return this.eventsService.batchCreate(req.user!.userId, dto.events ?? []);
  }

  /** Managers can query any user's events. */
  @Get('user/:id')
  getByUser(
    @Param('id') id: string,
    @Req() req: ReqUser,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('action') action?: string,
  ) {
    if (!MANAGER_ROLES.includes(req.user?.role ?? '')) {
      throw new ForbiddenException('Apenas gestores podem acessar eventos de usuários');
    }
    return this.eventsService.getByUser(id, {
      limit: limit ? Math.min(parseInt(limit), 500) : 200,
      page,
      action,
    });
  }

  /** Manual cleanup trigger (manager only). Normally done by a scheduled job. */
  @Post('cleanup')
  cleanup(@Req() req: ReqUser) {
    if (!MANAGER_ROLES.includes(req.user?.role ?? '')) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.eventsService.cleanup();
  }
}
