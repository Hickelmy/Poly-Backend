import { Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';

@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
