import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 60,
      },
    ]),
    PrismaModule,
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}


