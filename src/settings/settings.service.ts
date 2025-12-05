import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  private readonly SETTINGS_ID = 1;

  constructor(private readonly prisma: PrismaService) {}

  private async ensureExists() {
    const existing = await this.prisma.appSettings.findUnique({
      where: { id: this.SETTINGS_ID },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.appSettings.create({
      data: {
        id: this.SETTINGS_ID,
        maintenanceMode: false,
        openSignup: true,
        dailySummary: true,
        defaultLocale: 'pt-BR',
      },
    });
  }

  async get() {
    const settings = await this.ensureExists();
    if (!settings) {
      throw new NotFoundException('Configurações não encontradas');
    }
    return settings;
  }

  async update(dto: UpdateSettingsDto) {
    await this.ensureExists();
    return this.prisma.appSettings.update({
      where: { id: this.SETTINGS_ID },
      data: {
        maintenanceMode: dto.maintenanceMode,
        openSignup: dto.openSignup,
        dailySummary: dto.dailySummary,
        defaultLocale: dto.defaultLocale,
      },
    });
  }
}


