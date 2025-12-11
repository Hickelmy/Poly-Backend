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
} from '@nestjs/common';
import { ZonesService } from './zones.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body()
    body: {
      name: string;
      description?: string;
      color?: string;
      polygon_geojson?: any;
      center_lat?: number;
      center_lng?: number;
    },
  ) {
    // O service aceita snake_case e retorna já transformado
    return this.zonesService.create({
      name: body.name,
      description: body.description,
      color: body.color,
      polygon_geojson: body.polygon_geojson,
      center_lat: body.center_lat,
      center_lng: body.center_lng,
    });
  }

  @Get()
  async findAll(
    @Query('active') active?: string,
    @Query('orderBy') orderBy?: string,
    @Query('limit') limit?: string,
  ) {
    // O service já retorna os dados transformados para snake_case
    return this.zonesService.findAll({
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      orderBy,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    // O service já retorna os dados transformados para snake_case
    return this.zonesService.findOne(id);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@Param('id') id: string) {
    return this.zonesService.getStats(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
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
    },
  ) {
    // O service aceita snake_case e retorna já transformado
    return this.zonesService.update(id, {
      polygon_geojson: body.polygon_geojson,
      center_lat: body.center_lat,
      center_lng: body.center_lng,
      name: body.name,
      description: body.description,
      color: body.color,
      active: body.active,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id') id: string) {
    await this.zonesService.delete(id);
    return { success: true, message: 'Zona excluída com sucesso' };
  }
}

