import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { ZonesModule } from '../zones/zones.module';

@Module({
  imports: [ZonesModule],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}


