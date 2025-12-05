import { Module } from '@nestjs/common';
import { ProjectPaymentsService } from './project-payments.service';
import { ProjectPaymentsController } from './project-payments.controller';

@Module({
  controllers: [ProjectPaymentsController],
  providers: [ProjectPaymentsService],
})
export class ProjectPaymentsModule {}


