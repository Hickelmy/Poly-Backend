import { Module } from '@nestjs/common';
import { AdminRequestsController } from './admin-requests.controller';
import { AdminRequestsService } from './admin-requests.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminRequestsController],
  providers: [AdminRequestsService],
  exports: [AdminRequestsService],
})
export class AdminRequestsModule {}
