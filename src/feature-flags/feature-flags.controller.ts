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
} from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
  async create(@Body() dto: CreateFeatureFlagDto) {
    return this.featureFlagsService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFeatureFlagDto) {
    return this.featureFlagsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':key/toggle')
  async toggle(
    @Param('key') key: string,
    @Body('enabled') enabled: boolean,
  ) {
    return this.featureFlagsService.toggleGlobal(key, enabled);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.featureFlagsService.remove(id);
  }
}
