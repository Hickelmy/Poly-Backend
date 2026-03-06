import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD', '') || undefined,
          db: config.get<number>('REDIS_DB', 0),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'payments' },
      { name: 'notifications' },
    ),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
