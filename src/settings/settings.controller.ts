import { Body, Controller, Get, Patch, Req, ForbiddenException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get();
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async update(@Req() req: RequestWithUser, @Body() dto: UpdateSettingsDto) {
    const role = req.user?.role;
    if (!role || (role !== 'ADMIN' && role !== 'MANAGER')) {
      throw new ForbiddenException('Apenas administradores ou gestores podem alterar as configurações');
    }
    return this.settingsService.update(dto);
  }
}


