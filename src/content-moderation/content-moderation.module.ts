import { Module } from '@nestjs/common';
import { ContentModerationController } from './content-moderation.controller';
import { ContentModerationService } from './content-moderation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContentModerationController],
  providers: [ContentModerationService],
  exports: [ContentModerationService],
})
export class ContentModerationModule {}
