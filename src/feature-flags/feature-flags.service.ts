import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';

const CACHE_PREFIX = 'ff:';
const CACHE_TTL = 60; // 1 minuto

export interface FeatureFlagContext {
  userId?: string;
  userRole?: string;
  zoneId?: string;
  city?: string;
  state?: string;
}

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateFeatureFlagDto) {
    const flag = await this.prisma.featureFlag.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled ?? true,
        enabledZoneIds: dto.enabledZoneIds || [],
        disabledZoneIds: dto.disabledZoneIds || [],
        enabledCities: dto.enabledCities || [],
        disabledCities: dto.disabledCities || [],
        enabledStates: dto.enabledStates || [],
        disabledStates: dto.disabledStates || [],
        allowedRoles: dto.allowedRoles || [],
        blockedRoles: dto.blockedRoles || [],
        allowedUserIds: dto.allowedUserIds || [],
        blockedUserIds: dto.blockedUserIds || [],
        rolloutPercentage: dto.rolloutPercentage ?? 100,
        category: dto.category,
        priority: dto.priority ?? 0,
      },
    });

    await this.invalidateCache();
    return flag;
  }

  async findAll(category?: string) {
    const where: any = {};
    if (category) where.category = category;

    return this.prisma.featureFlag.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
  }

  async findByKey(key: string) {
    const cached = await this.redis.getJson<any>(`${CACHE_PREFIX}${key}`);
    if (cached) return cached;

    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new NotFoundException(`Feature flag "${key}" not found`);

    await this.redis.setJson(`${CACHE_PREFIX}${key}`, flag, CACHE_TTL);
    return flag;
  }

  async update(id: string, dto: UpdateFeatureFlagDto) {
    const flag = await this.prisma.featureFlag.update({
      where: { id },
      data: dto,
    });

    await this.invalidateCache();
    return flag;
  }

  async remove(id: string) {
    await this.prisma.featureFlag.delete({ where: { id } });
    await this.invalidateCache();
    return { success: true };
  }

  async toggleGlobal(key: string, enabled: boolean) {
    const flag = await this.prisma.featureFlag.update({
      where: { key },
      data: { enabled },
    });

    await this.invalidateCache();
    return flag;
  }

  /**
   * Verifica se uma feature está habilitada para um contexto específico.
   * Retorna true se a feature está ativa para o contexto dado.
   */
  async isEnabled(key: string, context: FeatureFlagContext = {}): Promise<boolean> {
    let flag: any;
    try {
      flag = await this.findByKey(key);
    } catch {
      // Se a flag não existe, assume habilitada (fail-open)
      return true;
    }

    // 1. Verificação global
    if (!flag.enabled) return false;

    // 2. Verificação de usuário bloqueado
    if (
      context.userId &&
      flag.blockedUserIds.length > 0 &&
      flag.blockedUserIds.includes(context.userId)
    ) {
      return false;
    }

    // 3. Verificação de usuário permitido (override)
    if (
      context.userId &&
      flag.allowedUserIds.length > 0 &&
      flag.allowedUserIds.includes(context.userId)
    ) {
      return true;
    }

    // 4. Verificação de role bloqueado
    if (
      context.userRole &&
      flag.blockedRoles.length > 0 &&
      flag.blockedRoles.includes(context.userRole)
    ) {
      return false;
    }

    // 5. Verificação de role permitido
    if (flag.allowedRoles.length > 0) {
      if (!context.userRole || !flag.allowedRoles.includes(context.userRole)) {
        return false;
      }
    }

    // 6. Verificação de zona desabilitada (prioridade)
    if (
      context.zoneId &&
      flag.disabledZoneIds.length > 0 &&
      flag.disabledZoneIds.includes(context.zoneId)
    ) {
      return false;
    }

    // 7. Verificação de zona habilitada
    if (flag.enabledZoneIds.length > 0) {
      if (!context.zoneId || !flag.enabledZoneIds.includes(context.zoneId)) {
        return false;
      }
    }

    // 8. Verificação de cidade desabilitada
    if (context.city) {
      const cityLower = context.city.toLowerCase();
      if (
        flag.disabledCities.length > 0 &&
        flag.disabledCities.some((c: string) => c.toLowerCase() === cityLower)
      ) {
        return false;
      }
    }

    // 9. Verificação de cidade habilitada
    if (flag.enabledCities.length > 0) {
      if (!context.city) return false;
      const cityLower = context.city.toLowerCase();
      if (!flag.enabledCities.some((c: string) => c.toLowerCase() === cityLower)) {
        return false;
      }
    }

    // 10. Verificação de estado desabilitado
    if (context.state) {
      const stateLower = context.state.toLowerCase();
      if (
        flag.disabledStates.length > 0 &&
        flag.disabledStates.some((s: string) => s.toLowerCase() === stateLower)
      ) {
        return false;
      }
    }

    // 11. Verificação de estado habilitado
    if (flag.enabledStates.length > 0) {
      if (!context.state) return false;
      const stateLower = context.state.toLowerCase();
      if (!flag.enabledStates.some((s: string) => s.toLowerCase() === stateLower)) {
        return false;
      }
    }

    // 12. Rollout gradual (baseado em hash do userId)
    if (flag.rolloutPercentage < 100 && context.userId) {
      const hash = this.simpleHash(context.userId + key);
      const bucket = hash % 100;
      if (bucket >= flag.rolloutPercentage) {
        return false;
      }
    }

    return true;
  }

  /**
   * Retorna todas as flags avaliadas para um contexto.
   * Útil para o frontend carregar todas as flags de uma vez.
   */
  async evaluateAll(
    context: FeatureFlagContext = {},
  ): Promise<Record<string, boolean>> {
    const flags = await this.prisma.featureFlag.findMany();
    const result: Record<string, boolean> = {};

    for (const flag of flags) {
      // Cache individual
      await this.redis.setJson(`${CACHE_PREFIX}${flag.key}`, flag, CACHE_TTL);
      result[flag.key] = await this.isEnabled(flag.key, context);
    }

    return result;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private async invalidateCache() {
    await this.redis.invalidatePattern(`${CACHE_PREFIX}*`);
  }
}
