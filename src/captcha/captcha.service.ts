import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly secretKey: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>('RECAPTCHA_SECRET_KEY', '');
    this.enabled = !!this.secretKey;

    if (!this.enabled) {
      this.logger.warn('RECAPTCHA_SECRET_KEY not configured. CAPTCHA validation disabled.');
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async verify(token: string, remoteIp?: string): Promise<boolean> {
    if (!this.enabled) return true;
    if (!token) return false;

    try {
      const params = new URLSearchParams({
        secret: this.secretKey,
        response: token,
      });
      if (remoteIp) params.append('remoteip', remoteIp);

      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        body: params,
      });

      const data = (await res.json()) as { success: boolean; score?: number };
      const minScore = this.config.get<number>('RECAPTCHA_MIN_SCORE', 0.5);

      if (data.score !== undefined) {
        return data.success && data.score >= minScore;
      }

      return data.success === true;
    } catch (e) {
      this.logger.error('CAPTCHA verification failed', e);
      return false;
    }
  }
}
