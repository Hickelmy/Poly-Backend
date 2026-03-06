import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

let Sentry: any = null;

@Injectable()
export class SentryService implements OnModuleInit {
  private readonly logger = new Logger(SentryService.name);
  private initialized = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const dsn = this.config.get<string>('SENTRY_DSN');
    if (!dsn) {
      this.logger.warn('SENTRY_DSN not configured. Error tracking disabled.');
      return;
    }

    try {
      Sentry = await import('@sentry/nestjs');
      Sentry.init({
        dsn,
        environment: this.config.get('NODE_ENV', 'development'),
        tracesSampleRate: this.config.get<number>('SENTRY_TRACES_SAMPLE_RATE', 0.1),
        debug: false,
      });
      this.initialized = true;
      this.logger.log('Sentry initialized');
    } catch (e) {
      this.logger.warn('Sentry initialization failed. Error tracking disabled.');
    }
  }

  captureException(error: Error, context?: Record<string, any>) {
    if (!this.initialized || !Sentry) return;
    if (context) {
      Sentry.withScope((scope: any) => {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
        Sentry.captureException(error);
      });
    } else {
      Sentry.captureException(error);
    }
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    if (!this.initialized || !Sentry) return;
    Sentry.captureMessage(message, level);
  }
}
