import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ZonesModule } from '../zones/zones.module';

@Module({
  imports: [ZonesModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}


