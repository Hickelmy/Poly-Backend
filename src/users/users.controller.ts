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

const ADMIN_ROLES = ['ADMIN', 'administrador', 'admin'];
const MANAGER_ROLES = ['MANAGER', 'gestor', ...ADMIN_ROLES];

function isAdmin(role?: string) {
  return role ? ADMIN_ROLES.includes(role) : false;
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
    // Only the user themselves or an admin can view full profile
    if (req.user?.userId !== id && !isAdmin(req.user?.role)) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: RequestWithUser) {
    if (req.user?.userId !== id && !isAdmin(req.user?.role)) {
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
    if (!isAdmin(req.user?.role)) {
      throw new ForbiddenException('Apenas administradores podem alterar roles');
    }
    return this.usersService.updateRole(id, role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (req.user?.userId !== id && !isAdmin(req.user?.role)) {
      throw new ForbiddenException('Você só pode excluir sua própria conta');
    }
    return this.usersService.remove(id);
  }
}


