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
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { FeatureFlagsService } from './feature-flags.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser extends Request {
  user?: { userId: string; email: string; role: string };
}

function requireAdminOrManager(role?: string) {
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    throw new ForbiddenException('Apenas administradores ou gestores podem gerenciar feature flags');
  }
}

@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  // --- Rotas públicas (avaliação de flags) ---

  @Get('evaluate')
  async evaluate(
    @Query('zoneId') zoneId?: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('userId') userId?: string,
    @Query('userRole') userRole?: string,
  ) {
    return this.featureFlagsService.evaluateAll({
      zoneId,
      city,
      state,
      userId,
      userRole,
    });
  }

  @Get('check/:key')
  async check(
    @Param('key') key: string,
    @Query('zoneId') zoneId?: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('userId') userId?: string,
    @Query('userRole') userRole?: string,
  ) {
    const enabled = await this.featureFlagsService.isEnabled(key, {
      zoneId,
      city,
      state,
      userId,
      userRole,
    });
    return { key, enabled };
  }

  // --- Rotas autenticadas (gestão de flags, requer ADMIN/MANAGER) ---

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Query('category') category?: string) {
    return this.featureFlagsService.findAll(category);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':key')
  async findByKey(@Param('key') key: string) {
    return this.featureFlagsService.findByKey(key);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateFeatureFlagDto, @Req() req: RequestWithUser) {
    requireAdminOrManager(req.user?.role);
    return this.featureFlagsService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFeatureFlagDto, @Req() req: RequestWithUser) {
    requireAdminOrManager(req.user?.role);
    return this.featureFlagsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':key/toggle')
  async toggle(
    @Param('key') key: string,
    @Body('enabled') enabled: boolean,
    @Req() req: RequestWithUser,
  ) {
    requireAdminOrManager(req.user?.role);
    return this.featureFlagsService.toggleGlobal(key, enabled);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    requireAdminOrManager(req.user?.role);
    return this.featureFlagsService.remove(id);
  }
}
