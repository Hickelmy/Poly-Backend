import { Body, Controller, Get, Post, Param, Patch, Delete, UseGuards, Req, ForbiddenException, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

// MANAGER = nível máximo (gestor), ADMIN = administrador parcial
const MANAGER_ROLES = ['MANAGER', 'gestor'];
const PRIVILEGED_ROLES = [...MANAGER_ROLES, 'ADMIN', 'administrador', 'admin'];

function isPrivileged(role?: string) {
  return role ? PRIVILEGED_ROLES.includes(role) : false;
}

function isManager(role?: string) {
  return role ? MANAGER_ROLES.includes(role) : false;
}

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @SkipThrottle()
  @Get('me')
  getMe(@Req() req: RequestWithUser) {
    return this.usersService.findOne(req.user!.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (req.user?.userId !== id && !isPrivileged(req.user?.role)) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: RequestWithUser) {
    if (req.user?.userId !== id && !isPrivileged(req.user?.role)) {
      throw new ForbiddenException('Você só pode atualizar seu próprio perfil');
    }
    return this.usersService.update(id, dto);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id') id: string,
    @Body('role') role: string,
    @Req() req: RequestWithUser,
  ) {
    // Apenas MANAGER pode alterar roles
    if (!isManager(req.user?.role)) {
      throw new ForbiddenException('Apenas gestores podem alterar roles');
    }
    return this.usersService.updateRole(id, role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (req.user?.userId !== id && !isPrivileged(req.user?.role)) {
      throw new ForbiddenException('Você só pode excluir sua própria conta');
    }
    return this.usersService.remove(id);
  }

  @Get()
  listAll(@Req() req: RequestWithUser, @Query('limit') limit?: string) {
    if (!isPrivileged(req.user?.role)) throw new ForbiddenException('Acesso negado');
    return this.usersService.listUsers(limit ? parseInt(limit) : 500);
  }

  @Post(':id/block')
  blockUser(@Param('id') id: string, @Body('reason') reason: string, @Req() req: RequestWithUser) {
    if (!isManager(req.user?.role)) throw new ForbiddenException('Apenas gestores podem bloquear usuários');
    return this.usersService.blockUser(id, req.user!.userId, req.user!.email, reason);
  }

  @Post(':id/unblock')
  unblockUser(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isManager(req.user?.role)) throw new ForbiddenException('Apenas gestores podem desbloquear usuários');
    return this.usersService.unblockUser(id, req.user!.userId, req.user!.email);
  }

  @Post(':id/ban')
  banUser(@Param('id') id: string, @Body('reason') reason: string, @Req() req: RequestWithUser) {
    if (!isManager(req.user?.role)) throw new ForbiddenException('Apenas gestores podem banir usuários');
    return this.usersService.banUser(id, req.user!.userId, req.user!.email, reason);
  }

  @Post(':id/unban')
  unbanUser(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isManager(req.user?.role)) throw new ForbiddenException('Apenas gestores podem desbanir usuários');
    return this.usersService.unbanUser(id, req.user!.userId, req.user!.email);
  }

  @Post(':id/verify')
  verifyUser(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isManager(req.user?.role)) throw new ForbiddenException('Apenas gestores podem verificar perfis');
    return this.usersService.verifyUser(id, req.user!.userId, req.user!.email);
  }

  @Post(':id/unverify')
  unverifyUser(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isManager(req.user?.role)) throw new ForbiddenException('Apenas gestores podem remover verificação');
    return this.usersService.unverifyUser(id, req.user!.userId, req.user!.email);
  }

  @Get(':id/activity')
  getUserActivity(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isPrivileged(req.user?.role)) throw new ForbiddenException('Acesso negado');
    return this.usersService.getUserActivity(id);
  }

  @Get('audit-logs/all')
  getAuditLogs(
    @Req() req: RequestWithUser,
    @Query('targetId') targetId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    if (!isPrivileged(req.user?.role)) throw new ForbiddenException('Acesso negado');
    return this.usersService.getAuditLogs({ targetId, actorId, action, limit: limit ? parseInt(limit) : 200 });
  }
}


