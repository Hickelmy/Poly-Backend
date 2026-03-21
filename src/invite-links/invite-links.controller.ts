import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InviteLinksService } from './invite-links.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('invite-links')
export class InviteLinksController {
  constructor(private readonly inviteLinksService: InviteLinksService) {}

  // Criar link de convite para uma zona
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Request() req: any,
    @Body() body: { zone_id: string; max_uses?: number; expires_at?: string },
  ) {
    const userId = req.user.userId ?? req.user.id;
    await this.inviteLinksService.assertZoneAdmin(userId, req.user.role, body.zone_id);

    return this.inviteLinksService.create({
      zoneId: body.zone_id,
      maxUses: body.max_uses,
      expiresAt: body.expires_at,
      createdById: userId,
      createdByEmail: req.user.email,
    });
  }

  // Listar links de uma zona
  @Get('zone/:zoneId')
  @UseGuards(JwtAuthGuard)
  async findByZone(@Request() req: any, @Param('zoneId') zoneId: string) {
    const userId = req.user.userId ?? req.user.id;
    await this.inviteLinksService.assertZoneAdmin(userId, req.user.role, zoneId);
    return this.inviteLinksService.findByZone(zoneId);
  }

  // Validar codigo (publico, para preview antes de entrar)
  @Get('validate/:code')
  @UseGuards(OptionalJwtAuthGuard)
  async validate(@Param('code') code: string) {
    return this.inviteLinksService.validate(code);
  }

  // Usar codigo para entrar na zona
  @Post('join/:code')
  @UseGuards(JwtAuthGuard)
  async join(@Request() req: any, @Param('code') code: string) {
    const userId = req.user.userId ?? req.user.id;
    return this.inviteLinksService.join(code, userId, req.user.email);
  }

  // Desativar link
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deactivate(@Request() req: any, @Param('id') id: string) {
    // Buscar o link para saber a zona e verificar permissao
    return this.inviteLinksService.deactivate(id);
  }
}
