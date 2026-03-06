import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagsService } from './feature-flags.service';

export const FEATURE_FLAG_KEY = 'feature_flag';

/**
 * Decorator para proteger rotas com feature flags.
 * Uso: @RequireFeatureFlag('store_enabled')
 */
export const RequireFeatureFlag = (flagKey: string) =>
  SetMetadata(FEATURE_FLAG_KEY, flagKey);

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagKey = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!flagKey) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const isEnabled = await this.featureFlagsService.isEnabled(flagKey, {
      userId: user?.userId,
      userRole: user?.role,
      zoneId: request.query?.zoneId || request.body?.zoneId,
      city: request.query?.city || request.body?.city,
      state: request.query?.state || request.body?.state,
    });

    if (!isEnabled) {
      throw new ForbiddenException(
        `This feature is currently disabled in your region/context.`,
      );
    }

    return true;
  }
}
