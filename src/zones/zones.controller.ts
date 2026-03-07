import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ZonesService } from './zones.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

function requireAdminOrManager(role?: string) {
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    throw new ForbiddenException('Apenas administradores ou gestores podem gerenciar zonas');
  }
}

@Controller('zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Request() req: any,
    @Body()
    body: {
      name: string;
      description?: string;
      color?: string;
      polygon_geojson?: any;
      center_lat?: number;
      center_lng?: number;
      is_public?: boolean;
      access_code?: string;
    },
  ) {
    requireAdminOrManager(req.user?.role);
    return this.zonesService.create({
      name: body.name,
      description: body.description,
      color: body.color,
      polygon_geojson: body.polygon_geojson,
      center_lat: body.center_lat,
      center_lng: body.center_lng,
      is_public: body.is_public,
      access_code: body.access_code,
    });
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async findAll(
    @Request() req: any,
    @Query('active') active?: string,
    @Query('orderBy') orderBy?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

    return this.zonesService.findAll({
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      orderBy,
      limit: limit ? parseInt(limit) : undefined,
      userId: user?.userId ?? user?.id,
      isAdmin,
    });
  }

  // Entrar em uma zona usando código de acesso
  @Post('join')
  @UseGuards(JwtAuthGuard)
  async joinWithCode(
    @Request() req: any,
    @Body() body: { access_code: string },
  ) {
    return this.zonesService.joinWithCode(req.user.userId ?? req.user.id, body.access_code);
  }

  // Listar zonas que o usuário tem acesso
  @Get('my-zones')
  @UseGuards(JwtAuthGuard)
  async getMyZones(@Request() req: any) {
    return this.zonesService.getUserZones(req.user.userId ?? req.user.id);
  }

  // Sair de uma zona
  @Delete('leave/:zoneId')
  @UseGuards(JwtAuthGuard)
  async leaveZone(@Request() req: any, @Param('zoneId') zoneId: string) {
    return this.zonesService.leaveZone(req.user.userId ?? req.user.id, zoneId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.zonesService.findOne(id, req.user?.userId ?? req.user?.id, req.user?.role);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@Request() req: any, @Param('id') id: string) {
    return this.zonesService.getStats(id, req.user?.userId ?? req.user?.id, req.user?.role);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      color?: string;
      polygon_geojson?: any;
      center_lat?: number;
      center_lng?: number;
      active?: boolean;
      is_public?: boolean;
      access_code?: string;
    },
  ) {
    requireAdminOrManager(req.user?.role);
    return this.zonesService.update(id, {
      polygon_geojson: body.polygon_geojson,
      center_lat: body.center_lat,
      center_lng: body.center_lng,
      name: body.name,
      description: body.description,
      color: body.color,
      active: body.active,
      is_public: body.is_public,
      access_code: body.access_code,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Request() req: any, @Param('id') id: string) {
    requireAdminOrManager(req.user?.role);
    await this.zonesService.delete(id);
    return { success: true, message: 'Zona excluída com sucesso' };
  }
}

