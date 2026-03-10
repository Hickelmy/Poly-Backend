import { Body, Controller, Get, Param, Patch, Delete, UseGuards, Req, ForbiddenException } from '@nestjs/common';
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
}


