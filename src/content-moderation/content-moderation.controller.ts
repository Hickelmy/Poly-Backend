import {
  Body, Controller, Get, Param, Patch, Post, Req, ForbiddenException, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContentModerationService } from './content-moderation.service';

interface ReqUser extends Request {
  user?: { userId: string; email: string; role: string };
}

const MANAGER_ROLES = ['MANAGER', 'gestor'];
const PRIVILEGED = [...MANAGER_ROLES, 'ADMIN', 'administrador', 'admin'];

@UseGuards(JwtAuthGuard)
@Controller('content-moderation')
export class ContentModerationController {
  constructor(private readonly svc: ContentModerationService) {}

  /** Get moderation state for one entity */
  @Get(':entityType/:entityId')
  get(@Param('entityType') et: string, @Param('entityId') eid: string) {
    return this.svc.get(et, eid);
  }

  /** Get all moderation records for a user's content */
  @Get('user/:userId')
  getByUser(@Param('userId') userId: string, @Req() req: ReqUser) {
    if (!PRIVILEGED.includes(req.user?.role ?? '')) throw new ForbiddenException('Acesso negado');
    return this.svc.getByUser(userId);
  }

  /** Upsert moderation state — manager/admin only */
  @Patch(':entityType/:entityId')
  upsert(
    @Param('entityType') et: string,
    @Param('entityId') eid: string,
    @Body() body: any,
    @Req() req: ReqUser,
  ) {
    if (!PRIVILEGED.includes(req.user?.role ?? '')) throw new ForbiddenException('Acesso negado');
    const { status, managerNotice, wasEdited, editNote, expiresAt } = body;
    return this.svc.upsert(et, eid, { status, managerNotice, wasEdited, editNote, expiresAt: expiresAt ? new Date(expiresAt) : undefined }, req.user!.userId, req.user!.email);
  }

  /** Grant approval seal */
  @Post(':entityType/:entityId/approve')
  approve(
    @Param('entityType') et: string,
    @Param('entityId') eid: string,
    @Body('approvalNote') approvalNote: string,
    @Req() req: ReqUser,
  ) {
    if (!MANAGER_ROLES.includes(req.user?.role ?? '')) throw new ForbiddenException('Apenas gestores podem aprovar');
    return this.svc.approve(et, eid, req.user!.userId, req.user!.email, approvalNote);
  }

  /** Revoke approval seal */
  @Post(':entityType/:entityId/revoke-approval')
  revokeApproval(
    @Param('entityType') et: string,
    @Param('entityId') eid: string,
    @Req() req: ReqUser,
  ) {
    if (!MANAGER_ROLES.includes(req.user?.role ?? '')) throw new ForbiddenException('Apenas gestores podem revogar aprovação');
    return this.svc.revokeApproval(et, eid, req.user!.userId, req.user!.email);
  }
}
