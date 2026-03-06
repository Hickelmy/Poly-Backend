import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaptchaService } from './captcha.service';

export const REQUIRE_CAPTCHA = 'require_captcha';

/**
 * Decorator: @RequireCaptcha()
 * O frontend deve enviar o header 'x-captcha-token' ou body.captchaToken
 */
export const RequireCaptcha = () => SetMetadata(REQUIRE_CAPTCHA, true);

@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly captchaService: CaptchaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireCaptcha = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_CAPTCHA,
      [context.getHandler(), context.getClass()],
    );

    if (!requireCaptcha) return true;
    if (!this.captchaService.isEnabled) return true;

    const request = context.switchToHttp().getRequest();
    const token =
      request.headers['x-captcha-token'] ||
      request.body?.captchaToken;

    if (!token) {
      throw new ForbiddenException('CAPTCHA token required');
    }

    const ip = request.ip || request.connection?.remoteAddress;
    const valid = await this.captchaService.verify(token, ip);

    if (!valid) {
      throw new ForbiddenException('CAPTCHA verification failed');
    }

    return true;
  }
}
