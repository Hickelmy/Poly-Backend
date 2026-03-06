import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrometheusService } from './prometheus.service';
import { SentryService } from './sentry.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrometheusService, SentryService],
  exports: [PrometheusService, SentryService],
})
export class ObservabilityModule {}
