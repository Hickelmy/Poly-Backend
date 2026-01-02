import { Module } from '@nestjs/common';
import { ServiceBookingsController } from './service-bookings.controller';
import { ServiceBookingsService } from './service-bookings.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ServiceBookingsController],
  providers: [ServiceBookingsService],
  exports: [ServiceBookingsService],
})
export class ServiceBookingsModule {}

