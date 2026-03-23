import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SupabaseModule } from './supabase/supabase.module';
import { FirebaseModule } from './firebase/firebase.module';
import { GeoModule } from './geo/geo.module';
import { QueueModule } from './queue/queue.module';
import { ObservabilityModule } from './observability/observability.module';
import { MetricsController } from './observability/metrics.controller';
import { CaptchaModule } from './captcha/captcha.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { ProductsModule } from './products/products.module';
import { ServicesModule } from './services/services.module';
import { ProjectsModule } from './projects/projects.module';
import { ProjectVotesModule } from './project-votes/project-votes.module';
import { ProjectPaymentsModule } from './project-payments/project-payments.module';
import { ApiTokensModule } from './api-tokens/api-tokens.module';
import { PaymentGatewayModule } from './payment-gateway/payment-gateway.module';
import { ZonesModule } from './zones/zones.module';
import { NewsModule } from './news/news.module';
import { ServiceBookingsModule } from './service-bookings/service-bookings.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { ModerationModule } from './moderation/moderation.module';
import { EventsModule } from './events/events.module';
import { ContentModerationModule } from './content-moderation/content-moderation.module';
import { InviteLinksModule } from './invite-links/invite-links.module';
import { AdminRequestsModule } from './admin-requests/admin-requests.module';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersModule } from './orders/orders.module';
import { IdempotencyMiddleware } from './common/idempotency.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 30 },    // 30 req/sec (burst) - evita 429 no carregamento do dashboard
      { name: 'medium', ttl: 10000, limit: 100 }, // 100 req/10sec
      { name: 'long', ttl: 60000, limit: 300 },   // 300 req/min
    ]),
    PrismaModule,
    RedisModule,
    SupabaseModule,
    FirebaseModule,
    GeoModule,
    QueueModule,
    ObservabilityModule,
    CaptchaModule,
    UsersModule,
    AuthModule,
    SettingsModule,
    ProductsModule,
    ServicesModule,
    ProjectsModule,
    ProjectVotesModule,
    ProjectPaymentsModule,
    ApiTokensModule,
    PaymentGatewayModule,
    ZonesModule,
    NewsModule,
    ServiceBookingsModule,
    FeatureFlagsModule,
    ModerationModule,
    EventsModule,
    ContentModerationModule,
    InviteLinksModule,
    AdminRequestsModule,
    ScheduleModule.forRoot(),
    OrdersModule,
  ],
  controllers: [AppController, MetricsController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Idempotency for payment-related routes
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes(
        { path: 'payment-gateway/*', method: RequestMethod.POST },
        { path: 'project-payments', method: RequestMethod.POST },
        { path: 'orders', method: RequestMethod.POST },
      );
  }
}
